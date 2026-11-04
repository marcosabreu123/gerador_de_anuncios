import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enfileirar } from "@/lib/agencia/fila";
import type { BriefingPecaManual } from "@/lib/agencia/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  pecaId: string;
  // Ajuste em linguagem natural ("deixa o preço maior", "fundo mais escuro").
  // Entra como direção adicional na próxima geração.
  instrucao?: string;
}

// Regera uma peça, opcionalmente com um ajuste pedido pelo operador.
//
// Não consome pacote de novo: a flag pacote_consumido da peça continua como
// está. O cliente comprou peças entregues, não tentativas — o custo do
// retrabalho sai da margem da agência, e aparece no dashboard como aumento
// de gerações por peça.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Regerar gasta API: mesma exigência de /api/geracoes/criar.
  const { data: perfil } = await supabase
    .from("users")
    .select("papel, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.ativo || (perfil.papel !== "socio" && perfil.papel !== "colaborador")) {
    return NextResponse.json({ error: "Sem permissão para gerar." }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (!body.pecaId) return NextResponse.json({ error: "Informe a peça." }, { status: 400 });

  const { data: peca } = await supabase.from("pecas").select("*").eq("id", body.pecaId).maybeSingle();
  if (!peca) return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });

  const instrucao = body.instrucao?.trim();
  const briefing = (peca.briefing ?? {}) as BriefingPecaManual;

  if (instrucao) {
    // O ajuste entra no próprio prompt e ACUMULA: o segundo pedido não pode
    // apagar o primeiro ("mais escuro" + "preço maior" valem juntos).
    const promptAtual = briefing.prompt ?? "";
    const promptAcumulado = `${promptAtual}\n\nAjuste pedido: ${instrucao}`.trim();

    // Com a arte já entregue na mão, ajustar é EDITAR aquela imagem, não
    // produzir outra: o operador pediu "o preço maior", não uma arte nova.
    // Aponta sempre para a imagem ATUAL da peça, então o segundo ajuste parte
    // do resultado do primeiro. Sem imagem (peça que falhou antes de gerar)
    // não há o que editar, e ela volta pelo caminho de criação com o ajuste
    // embutido no prompt.
    const ajuste: Partial<BriefingPecaManual> = peca.imagem_url
      ? { ajusteSobreUrl: peca.imagem_url as string, instrucaoAjuste: instrucao }
      : {};

    await supabase
      .from("pecas")
      .update({ briefing: { ...briefing, ...ajuste, prompt: promptAcumulado } })
      .eq("id", peca.id);
  } else if (briefing.ajusteSobreUrl || briefing.instrucaoAjuste) {
    // "Tentar de novo" sem instrução: refazer, não repetir o ajuste anterior.
    // Sem limpar, uma peça que falhou depois de um ajuste voltaria editando a
    // imagem velha com o pedido velho.
    const limpo = { ...briefing };
    delete limpo.ajusteSobreUrl;
    delete limpo.instrucaoAjuste;
    await supabase.from("pecas").update({ briefing: limpo }).eq("id", peca.id);
  }

  await supabase.from("pecas").update({ status: "pendente", erro: null }).eq("id", peca.id);
  await enfileirar("gerar_peca", peca.id);

  dispararWorker(request);

  return NextResponse.json({ ok: true, pecaId: peca.id });
}

// Mesma mecânica de /api/geracoes/criar: dentro de `after()` porque um `void
// fetch` solto morre junto com a instância assim que a resposta sai.
function dispararWorker(request: NextRequest) {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : new URL(request.url).origin;
  const segredo = process.env.CRON_SECRET;

  after(async () => {
    await fetch(`${base}/api/fila/processar`, {
      method: "POST",
      headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // Esperado: o abort. A tela do pedido e o cron insistem depois.
    });
  });
}
