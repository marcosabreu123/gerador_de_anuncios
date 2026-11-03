import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { materiaisDisponiveis, tituloDoPedido, transcreverAudio } from "@/lib/ai/agente-pedido";
import { enfileirar } from "@/lib/agencia/fila";
import { saldoDoCliente } from "@/lib/agencia/pacotes";
import { PRECO_TRANSCRICAO_USD_POR_MINUTO, registrarGeracao } from "@/lib/agencia/custo";
import type { EstiloComunicacao, Formato, IntensidadeVisual } from "@/lib/types";
import type { BriefingPecaManual, Referencia } from "@/lib/agencia/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Geração manual: o operador manda o pedido (texto ou áudio) com os controles
// já definidos e a produção começa. Substituiu o fluxo de "planejar lote e
// aprovar plano" — o operador conhece o cliente e prefere pedir direto.
//
// Esta rota NÃO gera imagem: cria as peças e enfileira. A geração roda no
// worker, porque cada imagem leva de 40 a 90 segundos.

const MAX_IMAGENS_POR_PEDIDO = 4;

const FORMATOS_VALIDOS: Formato[] = ["story-9-16", "feed-4-5", "quadrado-1-1"];
const ESTILOS_VALIDOS: EstiloComunicacao[] = [
  "premium",
  "moderno",
  "clean",
  "vibrante",
  "minimalista",
  "ia_decide",
];
const INTENSIDADES_VALIDAS: IntensidadeVisual[] = ["discreta", "equilibrada", "impactante", "ia_decide"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Produção é permitida a sócio e colaborador; quem não tem papel não passa.
  const { data: perfil } = await supabase
    .from("users")
    .select("papel, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.ativo || (perfil.papel !== "socio" && perfil.papel !== "colaborador")) {
    return NextResponse.json({ error: "Sem permissão para gerar." }, { status: 403 });
  }

  let clienteId = "";
  let prompt = "";
  let quantidade = 1;
  let formato: Formato = "feed-4-5";
  let estilo: EstiloComunicacao = "ia_decide";
  let intensidade: IntensidadeVisual = "ia_decide";
  let origem: "audio" | "texto" = "texto";
  let forcarSemSaldo = false;
  let arteBaseUrl: string | undefined;
  let modoTransformacao: "melhoria_recompositiva" | "nova_versao_criativa" | undefined;

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      clienteId = String(form.get("clienteId") ?? "");
      quantidade = Number(form.get("quantidade") ?? 1);
      formato = String(form.get("formato") ?? "feed-4-5") as Formato;
      estilo = String(form.get("estilo") ?? "ia_decide") as EstiloComunicacao;
      intensidade = String(form.get("intensidade") ?? "ia_decide") as IntensidadeVisual;
      forcarSemSaldo = form.get("forcarSemSaldo") === "true";
      arteBaseUrl = (form.get("arteBaseUrl") as string) || undefined;
      modoTransformacao = (form.get("modoTransformacao") as typeof modoTransformacao) || undefined;

      const audio = form.get("audio");
      if (audio instanceof File && audio.size > 0) {
        origem = "audio";
        const inicio = Date.now();
        const { texto, duracaoSegundos } = await transcreverAudio(audio);
        prompt = texto;

        // Sem duração na resposta, estima pelo tamanho para o custo não ficar
        // zerado no rateio.
        const minutos = (duracaoSegundos ?? audio.size / 32_000) / 60;
        await registrarGeracao({
          tipo: "transcricao",
          modelo: "whisper-1",
          custoUsd: minutos * PRECO_TRANSCRICAO_USD_POR_MINUTO,
          duracaoMs: Date.now() - inicio,
          clienteId,
        });
      } else {
        prompt = String(form.get("prompt") ?? "");
      }
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      clienteId = String(body.clienteId ?? "");
      prompt = String(body.prompt ?? "");
      quantidade = Number(body.quantidade ?? 1);
      formato = (body.formato as Formato) ?? "feed-4-5";
      estilo = (body.estilo as EstiloComunicacao) ?? "ia_decide";
      intensidade = (body.intensidade as IntensidadeVisual) ?? "ia_decide";
      forcarSemSaldo = body.forcarSemSaldo === true;
      arteBaseUrl = (body.arteBaseUrl as string) || undefined;
      modoTransformacao = (body.modoTransformacao as typeof modoTransformacao) || undefined;
    }
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  // Validação no servidor, não só na tela: estes valores entram direto no
  // prompt e no tamanho da imagem.
  if (!clienteId) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
  if (!prompt.trim()) {
    return NextResponse.json({ error: "Descreva o que você precisa (ou grave o áudio)." }, { status: 400 });
  }
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_IMAGENS_POR_PEDIDO) {
    return NextResponse.json(
      { error: `A quantidade precisa ser de 1 a ${MAX_IMAGENS_POR_PEDIDO}.` },
      { status: 400 },
    );
  }
  if (!FORMATOS_VALIDOS.includes(formato)) formato = "feed-4-5";
  if (!ESTILOS_VALIDOS.includes(estilo)) estilo = "ia_decide";
  if (!INTENSIDADES_VALIDAS.includes(intensidade)) intensidade = "ia_decide";

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });

  // Confere saldo antes de produzir. Colaborador não pode furar o saldo: a
  // decisão de produzir fiado é comercial, então fica com o sócio.
  const saldo = await saldoDoCliente(clienteId);
  if (saldo.disponivel < quantidade && !(forcarSemSaldo && perfil.papel === "socio")) {
    return NextResponse.json(
      {
        error: `Saldo insuficiente: o cliente tem ${saldo.disponivel} imagem(ns) e você pediu ${quantidade}.`,
        saldoInsuficiente: true,
        disponivel: saldo.disponivel,
        necessario: quantidade,
        podeForcar: perfil.papel === "socio",
      },
      { status: 402 },
    );
  }

  try {
    const { data: referencias } = await supabase
      .from("referencias")
      .select("*")
      .eq("cliente_id", clienteId);
    const materiais = materiaisDisponiveis((referencias ?? []) as Referencia[]);

    const { data: pedido, error: erroPedido } = await supabase
      .from("pedidos")
      .insert({
        cliente_id: clienteId,
        titulo: tituloDoPedido(prompt, quantidade),
        pedido_original: prompt,
        origem,
        status: "processando",
        criado_por: user.id,
        aprovado_em: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (erroPedido || !pedido) throw new Error("Falha ao registrar o pedido.");

    const pecas: { pedido_id: string; cliente_id: string; ordem: number; titulo: string; briefing: BriefingPecaManual; status: string }[] =
      Array.from({ length: quantidade }, (_, i) => ({
        pedido_id: pedido.id,
        cliente_id: clienteId,
        ordem: i,
        titulo: quantidade > 1 ? `Variação ${i + 1}` : "Arte",
        briefing: {
          prompt,
          formato,
          estilo,
          intensidade,
          variacao: i,
          total: quantidade,
          ...(arteBaseUrl ? { arteBaseUrl, modoTransformacao: modoTransformacao ?? "melhoria_recompositiva" } : {}),
        },
        status: "pendente",
      }));

    const { data: criadas, error: erroPecas } = await supabase.from("pecas").insert(pecas).select("id");
    if (erroPecas || !criadas?.length) throw new Error("Falha ao criar as peças.");

    for (const peca of criadas) {
      await enfileirar("gerar_peca", peca.id);
    }

    // Cutuca o worker para começar agora, sem esperar o próximo tique do
    // cron. Se falhar, o cron pega em até um minuto — por isso não é erro.
    dispararWorker(request);

    return NextResponse.json({
      pedidoId: pedido.id,
      pecas: criadas.length,
      materiaisUsados: materiais,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao iniciar a geração.";
    console.error("[/api/geracoes/criar]", e);
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
    // O cron é a garantia; isto aqui só adianta.
  }
}
