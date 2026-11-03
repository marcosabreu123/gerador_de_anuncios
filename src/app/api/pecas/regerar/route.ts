import { NextResponse, type NextRequest } from "next/server";
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
  if (instrucao) {
    const briefing = (peca.briefing ?? {}) as BriefingPecaManual;
    // O ajuste entra no próprio prompt e ACUMULA: o segundo pedido não pode
    // apagar o primeiro ("mais escuro" + "preço maior" valem juntos).
    const promptAtual = briefing.prompt ?? "";
    await supabase
      .from("pecas")
      .update({
        briefing: {
          ...briefing,
          prompt: `${promptAtual}\n\nAjuste pedido: ${instrucao}`.trim(),
        },
      })
      .eq("id", peca.id);
  }

  await supabase.from("pecas").update({ status: "pendente", erro: null }).eq("id", peca.id);
  await enfileirar("gerar_peca", peca.id);

  dispararWorker(request);

  return NextResponse.json({ ok: true, pecaId: peca.id });
}

function dispararWorker(request: NextRequest) {
  try {
    const base = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : new URL(request.url).origin;
    const segredo = process.env.CRON_SECRET;
    void fetch(`${base}/api/fila/processar`, {
      method: "POST",
      headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
    }).catch(() => {});
  } catch {
    // O cron é a garantia; isso aqui só adianta.
  }
}
