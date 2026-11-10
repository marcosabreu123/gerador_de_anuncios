import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enfileirar } from "@/lib/agencia/fila";
import { bloqueioDeGeracao, saldoDoCliente } from "@/lib/agencia/pacotes";
import type { BriefingPecaManual } from "@/lib/agencia/types";
import { FORMATOS, type Formato } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// "Outro formato": a arte pronta vira uma peça nova no mesmo pedido, em outra
// proporção, com os mesmos textos, produto e identidade. A original continua como
// está, então o cliente recebe as duas: o feed e o story da mesma campanha.
//
// Por baixo é a troca de formato que o ajuste já fazia (ver promptNovoFormato),
// só que numa peça irmã em vez de em cima da arte original. Como peça própria, ela
// gasta crédito só se for aprovada.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Gasta API: mesma exigência de /api/geracoes/criar.
  const { data: perfil } = await supabase
    .from("users")
    .select("papel, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.ativo || (perfil.papel !== "socio" && perfil.papel !== "colaborador")) {
    return NextResponse.json({ error: "Sem permissão para gerar." }, { status: 403 });
  }

  let body: { pecaId?: unknown; formato?: unknown; forcarSemSaldo?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const pecaId = typeof body.pecaId === "string" ? body.pecaId : "";
  const formato = body.formato as Formato;
  if (!pecaId) return NextResponse.json({ error: "Informe a peça." }, { status: 400 });
  if (!(formato in FORMATOS)) return NextResponse.json({ error: "Formato inválido." }, { status: 400 });

  const { data: fonte } = await supabase.from("pecas").select("*").eq("id", pecaId).maybeSingle();
  if (!fonte) return NextResponse.json({ error: "Peça não encontrada." }, { status: 404 });
  // Com a peça na fila, a arte que está saindo é outra: adaptar a de agora seria
  // adaptar uma imagem que está para ser trocada.
  if (!fonte.imagem_url || fonte.status === "pendente" || fonte.status === "gerando") {
    return NextResponse.json({ error: "Espere a arte ficar pronta para fazer outro formato." }, { status: 409 });
  }

  const base = (fonte.briefing ?? {}) as BriefingPecaManual;
  if ((base.formato ?? "feed-4-5") === formato) {
    return NextResponse.json({ error: "Esta arte já está nesse formato." }, { status: 400 });
  }

  const { data: cliente } = await supabase.from("clientes").select("ativo").eq("id", fonte.cliente_id).maybeSingle();
  if (!cliente?.ativo) {
    return NextResponse.json({ error: "Este cliente está arquivado. Reative antes de produzir." }, { status: 409 });
  }

  // Mesma regra da criação: sem crédito, a arte nova não teria como ser aprovada.
  const bloqueio = bloqueioDeGeracao(await saldoDoCliente(fonte.cliente_id));
  if (bloqueio && !(body.forcarSemSaldo === true && perfil.papel === "socio")) {
    return NextResponse.json(
      { error: bloqueio, saldoInsuficiente: true, podeForcar: perfil.papel === "socio" },
      { status: 402 },
    );
  }

  const { data: irmas } = await supabase
    .from("pecas")
    .select("ordem")
    .eq("pedido_id", fonte.pedido_id)
    .order("ordem", { ascending: false })
    .limit(1);
  const rotulo = `${FORMATOS[formato].label} ${FORMATOS[formato].aspecto}`;

  // Herda o pedido e os controles, não o histórico: as versões, o ajuste em curso
  // e a arte-base são da peça de origem.
  const briefing: BriefingPecaManual = {
    prompt: base.prompt ?? "",
    formato,
    ...(base.estilo ? { estilo: base.estilo } : {}),
    ...(base.intensidade ? { intensidade: base.intensidade } : {}),
    ...(base.tipoImagem ? { tipoImagem: base.tipoImagem } : {}),
    ...(base.produtoRefId ? { produtoRefId: base.produtoRefId } : {}),
    ...(base.objetivo ? { objetivo: base.objetivo } : {}),
    ...(base.obrigatorios?.length ? { obrigatorios: base.obrigatorios } : {}),
    variacao: 0,
    total: 1,
    ajusteSobreUrl: fonte.imagem_url as string,
    instrucaoAjuste: `Adaptar esta arte para o formato ${rotulo}`,
    formatoNovo: formato,
    adaptadaDe: fonte.id as string,
  };

  const { data: nova, error } = await supabase
    .from("pecas")
    .insert({
      pedido_id: fonte.pedido_id,
      cliente_id: fonte.cliente_id,
      ordem: (irmas?.[0]?.ordem ?? fonte.ordem) + 1,
      titulo: `${fonte.titulo ?? "Arte"} · ${FORMATOS[formato].label}`,
      briefing,
      status: "pendente",
    })
    .select("id")
    .single();
  if (error || !nova) {
    console.error("[/api/pecas/outro-formato]", error);
    return NextResponse.json({ error: "Não consegui criar a peça. Tente de novo." }, { status: 500 });
  }

  try {
    await enfileirar("gerar_peca", nova.id);
  } catch {
    // Sem job a peça ficaria "Na fila" para sempre. Em erro, o "Tentar de novo" a põe na fila.
    await supabase.from("pecas").update({ status: "erro", erro: "Não consegui pôr a peça na fila." }).eq("id", nova.id);
    return NextResponse.json({ error: "Não consegui pôr a peça na fila. Use o Tentar de novo dela." }, { status: 500 });
  }

  // O pedido volta a andar: a lista mostra "Produzindo" e a tela acompanha a peça nova.
  await supabase.from("pedidos").update({ status: "processando", concluido_em: null }).eq("id", fonte.pedido_id);
  dispararWorker(request);

  return NextResponse.json({ ok: true, pecaId: nova.id });
}

// Mesma mecânica de /api/geracoes/criar: dentro de `after()` porque um `void
// fetch` solto morre junto com a instância assim que a resposta sai.
function dispararWorker(request: NextRequest) {
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : new URL(request.url).origin;
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
