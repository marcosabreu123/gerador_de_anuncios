import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enfileirar } from "@/lib/agencia/fila";
import { MAX_IMAGENS_AJUSTE, type BriefingPecaManual } from "@/lib/agencia/types";
import { formatoPedidoExplicitamente } from "@/lib/image-dimensions";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  pecaId: string;
  // Ajuste em linguagem natural ("deixa o preço maior", "fundo mais escuro").
  // Entra como direção adicional na próxima geração.
  instrucao?: string;
  // Imagens anexadas ao ajuste, já enviadas ao Storage pelo navegador.
  imagens?: unknown;
}

// O worker baixa estas imagens do servidor: só valem as do nosso Storage, para a
// rota não virar porta para buscar endereço qualquer.
function doNossoStorage(url: string): boolean {
  // Sem barra no fim: é assim que o supabase-js monta o endereço público.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  const bucket = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";
  return Boolean(base) && url.startsWith(`${base}/storage/v1/object/public/${bucket}/`) && !url.includes("..");
}

// Regera uma peça, opcionalmente com um ajuste pedido pelo operador.
//
// Não gasta crédito: ele só sai quando a arte é aprovada, uma vez por peça. O
// cliente comprou artes aprovadas, não tentativas — o custo do retrabalho sai
// da margem da agência e aparece no painel como custo por arte aprovada.
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

  const instrucao = body.instrucao?.trim();
  const imagens = body.imagens ?? [];
  if (!Array.isArray(imagens) || imagens.some((u) => typeof u !== "string" || !doNossoStorage(u))) {
    return NextResponse.json({ error: "Imagem anexada inválida. Envie de novo." }, { status: 400 });
  }
  if (imagens.length > MAX_IMAGENS_AJUSTE) {
    return NextResponse.json({ error: `Anexe no máximo ${MAX_IMAGENS_AJUSTE} imagens.` }, { status: 400 });
  }
  // A imagem sozinha não diz o que fazer com ela.
  if (imagens.length > 0 && !instrucao) {
    return NextResponse.json({ error: "Escreva o que fazer com a imagem anexada." }, { status: 400 });
  }

  const { data: peca } = await supabase.from("pecas").select("*").eq("id", body.pecaId).maybeSingle();
  if (!peca) return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });

  const briefing = (peca.briefing ?? {}) as BriefingPecaManual;

  // Formato pedido e imagens anexadas num ajuste que falhou não podem valer para o próximo.
  const semFormatoPendente = { ...briefing };
  delete semFormatoPendente.formatoNovo;
  delete semFormatoPendente.imagensAjuste;

  if (instrucao) {
    // O ajuste entra no próprio prompt e ACUMULA: o segundo pedido não pode
    // apagar o primeiro ("mais escuro" + "preço maior" valem juntos).
    const promptAtual = briefing.prompt ?? "";
    const promptAcumulado = `${promptAtual}\n\nAjuste pedido: ${instrucao}`.trim();

    const pedido = formatoPedidoExplicitamente(instrucao);
    const formatoNovo = pedido && pedido !== (briefing.formato ?? "feed-4-5") ? pedido : null;

    // Com a arte já entregue na mão, ajustar é EDITAR aquela imagem, não
    // produzir outra: o operador pediu "o preço maior", não uma arte nova.
    // Aponta sempre para a imagem ATUAL da peça, então o segundo ajuste parte
    // do resultado do primeiro. Sem imagem (peça que falhou antes de gerar)
    // não há o que editar, e ela volta pelo caminho de criação com o ajuste
    // embutido no prompt.
    const ajuste: Partial<BriefingPecaManual> = peca.imagem_url
      ? {
          ajusteSobreUrl: peca.imagem_url as string,
          instrucaoAjuste: instrucao,
          ...(formatoNovo ? { formatoNovo } : {}),
          ...(imagens.length > 0 ? { imagensAjuste: imagens as string[] } : {}),
        }
      : formatoNovo
        ? { formato: formatoNovo }
        : {};

    await supabase
      .from("pecas")
      .update({ briefing: { ...semFormatoPendente, ...ajuste, prompt: promptAcumulado } })
      .eq("id", peca.id);
  } else if (briefing.adaptadaDe && !peca.imagem_url) {
    // Peça do "Outro formato" que ainda não saiu: tentar de novo é adaptar de novo
    // a mesma arte, não criar outra do zero com o pedido antigo.
  } else if (briefing.ajusteSobreUrl || briefing.instrucaoAjuste || briefing.formatoNovo || briefing.imagensAjuste) {
    // "Tentar de novo" sem instrução: refazer, não repetir o ajuste anterior.
    // Sem limpar, uma peça que falhou depois de um ajuste voltaria editando a
    // imagem velha com o pedido velho.
    const limpo = { ...semFormatoPendente };
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
