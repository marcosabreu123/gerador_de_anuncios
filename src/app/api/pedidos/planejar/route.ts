import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { montarContextoCliente, planejarPedido, transcreverAudio } from "@/lib/ai/agente-pedido";
import { custoTextoUSD, registrarGeracao, PRECO_TRANSCRICAO_USD_POR_MINUTO } from "@/lib/agencia/custo";
import type { BrandKit, Cliente, Referencia } from "@/lib/agencia/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Planeja um lote a partir de um pedido solto (texto ou áudio). NÃO gera
// imagem nenhuma e não consome pacote: devolve o plano para o operador
// conferir. É o ponto de controle de custo — se o agente entendeu errado o
// áudio, isso aparece aqui, antes de queimar 5 gerações.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let clienteId = "";
  let pedidoTexto = "";
  let origem: "audio" | "texto" = "texto";
  let custoTranscricaoUsd = 0;

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      clienteId = String(form.get("clienteId") ?? "");
      const audio = form.get("audio");

      if (audio instanceof File && audio.size > 0) {
        origem = "audio";
        const inicio = Date.now();
        const { texto, duracaoSegundos } = await transcreverAudio(audio);
        pedidoTexto = texto;

        // Sem duração na resposta, estima pelo tamanho do arquivo para o
        // custo não ficar zerado no rateio.
        const minutos = (duracaoSegundos ?? audio.size / 32_000) / 60;
        custoTranscricaoUsd = minutos * PRECO_TRANSCRICAO_USD_POR_MINUTO;

        await registrarGeracao({
          tipo: "transcricao",
          modelo: "whisper-1",
          custoUsd: custoTranscricaoUsd,
          duracaoMs: Date.now() - inicio,
          clienteId,
        });
      } else {
        pedidoTexto = String(form.get("texto") ?? "");
      }
    } else {
      const body = (await request.json()) as { clienteId?: string; texto?: string };
      clienteId = body.clienteId ?? "";
      pedidoTexto = body.texto ?? "";
    }
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (!clienteId) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
  if (!pedidoTexto.trim()) {
    return NextResponse.json({ error: "Descreva o que você precisa (ou envie o áudio)." }, { status: 400 });
  }

  const { data: cliente } = await supabase.from("clientes").select("*").eq("id", clienteId).maybeSingle();
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  const { data: brandKit } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const { data: referencias } = await supabase
    .from("referencias")
    .select("*")
    .eq("cliente_id", clienteId);

  try {
    const contexto = montarContextoCliente(
      cliente as Cliente,
      (brandKit as BrandKit) ?? null,
      (referencias ?? []) as Referencia[],
    );

    const inicio = Date.now();
    const { plano, usageRaw, modelo } = await planejarPedido(pedidoTexto, contexto);

    const usage = usageRaw as { prompt_tokens?: number; completion_tokens?: number } | null;
    await registrarGeracao({
      tipo: "texto",
      modelo,
      custoUsd: custoTextoUSD(modelo, usage?.prompt_tokens ?? 0, usage?.completion_tokens ?? 0),
      usageRaw,
      duracaoMs: Date.now() - inicio,
      clienteId,
    });

    const { data: pedido, error } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: clienteId,
        titulo: plano.resumo.slice(0, 120),
        pedido_original: pedidoTexto,
        origem,
        plano,
        status: "planejado",
        criado_por: user.id,
      })
      .select("*")
      .single();

    if (error || !pedido) throw new Error("Falha ao salvar o pedido.");

    return NextResponse.json({ pedido, plano });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao planejar o pedido.";
    console.error("[/api/pedidos/planejar]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
