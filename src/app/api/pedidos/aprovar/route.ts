import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enfileirar } from "@/lib/agencia/fila";
import { saldoDoCliente } from "@/lib/agencia/pacotes";
import type { Formato } from "@/lib/types";
import type { PlanoPedido } from "@/lib/agencia/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  pedidoId: string;
  formato?: Formato;
  // Permite aprovar mesmo sem saldo no pacote (ex.: cliente vai pagar o
  // próximo pacote hoje). Exige escolha consciente, nunca é o padrão.
  forcarSemSaldo?: boolean;
}

// Aprova o plano e dispara a produção: cria as peças e enfileira um job por
// peça. A geração em si acontece no worker (ver /api/fila/processar), porque
// um lote de 5 imagens leva de 3 a 8 minutos e não cabe numa request.
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
  if (!body.pedidoId) return NextResponse.json({ error: "Informe o pedido." }, { status: 400 });

  const { data: pedido } = await supabase
    .from("pedidos")
    .select("*")
    .eq("id", body.pedidoId)
    .maybeSingle();
  if (!pedido) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });

  if (pedido.status !== "planejado" && pedido.status !== "erro") {
    return NextResponse.json(
      { error: `Este pedido já foi aprovado (status: ${pedido.status}).` },
      { status: 409 },
    );
  }

  const plano = pedido.plano as PlanoPedido | null;
  if (!plano?.pecas?.length) {
    return NextResponse.json({ error: "Este pedido não tem um plano válido." }, { status: 400 });
  }

  // Confere saldo antes de produzir: evita descobrir que o cliente não tem
  // pacote só depois de gastar as gerações.
  const saldo = await saldoDoCliente(pedido.cliente_id);
  if (saldo.disponivel < plano.pecas.length && !body.forcarSemSaldo) {
    return NextResponse.json(
      {
        error: `Saldo insuficiente: o cliente tem ${saldo.disponivel} imagem(ns) e o lote pede ${plano.pecas.length}.`,
        saldoInsuficiente: true,
        disponivel: saldo.disponivel,
        necessario: plano.pecas.length,
      },
      { status: 402 },
    );
  }

  const formato: Formato = body.formato ?? "feed-4-5";

  try {
    const { data: pecasCriadas, error: erroPecas } = await supabase
      .from("pecas")
      .insert(
        plano.pecas.map((peca, i) => ({
          pedido_id: pedido.id,
          cliente_id: pedido.cliente_id,
          ordem: i,
          titulo: peca.titulo,
          briefing: { ...peca, formato },
          status: "pendente",
        })),
      )
      .select("id");

    if (erroPecas || !pecasCriadas?.length) throw new Error("Falha ao criar as peças.");

    for (const peca of pecasCriadas) {
      await enfileirar("gerar_peca", peca.id);
    }

    await supabase
      .from("pedidos")
      .update({ status: "processando", aprovado_em: new Date().toISOString() })
      .eq("id", pedido.id);

    // Cutuca o worker para o lote começar agora, sem esperar o próximo tique
    // do cron. Se falhar, o cron pega em até um minuto — por isso não é erro.
    dispararWorker(request);

    return NextResponse.json({ pedidoId: pedido.id, pecas: pecasCriadas.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao aprovar o pedido.";
    console.error("[/api/pedidos/aprovar]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
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
    // Silencioso de propósito: o cron é a garantia, isso aqui é só a pressa.
  }
}
