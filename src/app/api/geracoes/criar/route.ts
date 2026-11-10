import { after, NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { materiaisDisponiveis, tituloDoPedido } from "@/lib/ai/agente-pedido";
import { enfileirar } from "@/lib/agencia/fila";
import {
  lerTextosObrigatorios,
  objetivoValido,
  pedidoDosCampos,
  type ObjetivoArte,
} from "@/lib/agencia/objetivos";
import { bloqueioDeGeracao, saldoDoCliente } from "@/lib/agencia/pacotes";
import { transcreverPedido } from "@/lib/agencia/transcricao";
import type { EstiloComunicacao, Formato, IntensidadeVisual, TipoImagem } from "@/lib/types";
import {
  PEDIDO_SEM_TEXTO,
  type BriefingPecaManual,
  type ModoImagemEnviada,
  type Referencia,
} from "@/lib/agencia/types";

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
const TIPOS_IMAGEM_VALIDOS: TipoImagem[] = ["foto", "grafico", "ilustracao", "ia_decide"];

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
  let tipoImagem: TipoImagem = "ia_decide";
  let origem: "audio" | "texto" = "texto";
  let forcarSemSaldo = false;
  let arteBaseUrl: string | undefined;
  let modoTransformacao: ModoImagemEnviada = "referencia";
  let produtoRefId: string | undefined;
  let objetivo: ObjetivoArte = "livre";
  // Os campos do objetivo como vieram da tela: { produto: "...", preco: "..." }.
  let camposBrutos: unknown = {};

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      clienteId = String(form.get("clienteId") ?? "");
      quantidade = Number(form.get("quantidade") ?? 1);
      formato = String(form.get("formato") ?? "feed-4-5") as Formato;
      estilo = String(form.get("estilo") ?? "ia_decide") as EstiloComunicacao;
      intensidade = String(form.get("intensidade") ?? "ia_decide") as IntensidadeVisual;
      tipoImagem = String(form.get("tipoImagem") ?? "ia_decide") as TipoImagem;
      forcarSemSaldo = form.get("forcarSemSaldo") === "true";
      arteBaseUrl = (form.get("arteBaseUrl") as string) || undefined;
      modoTransformacao = (form.get("modoTransformacao") as ModoImagemEnviada) || modoTransformacao;
      produtoRefId = (form.get("produtoRefId") as string) || undefined;
      objetivo = objetivoValido(form.get("objetivo"));
      camposBrutos = JSON.parse(String(form.get("campos") ?? "{}"));

      const audio = form.get("audio");
      if (audio instanceof File && audio.size > 0) {
        origem = "audio";
        prompt = await transcreverPedido(audio, clienteId);
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
      tipoImagem = (body.tipoImagem as TipoImagem) ?? "ia_decide";
      forcarSemSaldo = body.forcarSemSaldo === true;
      arteBaseUrl = (body.arteBaseUrl as string) || undefined;
      modoTransformacao = (body.modoTransformacao as ModoImagemEnviada) || modoTransformacao;
      produtoRefId = (body.produtoRefId as string) || undefined;
      objetivo = objetivoValido(body.objetivo);
      camposBrutos = body.campos ?? {};
    }
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  // Validação no servidor, não só na tela: estes valores entram direto no
  // prompt e no tamanho da imagem.
  if (!clienteId) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
  const obrigatorios = lerTextosObrigatorios(objetivo, camposBrutos);
  if (!obrigatorios) {
    return NextResponse.json({ error: "Um dos campos ficou longo demais para caber na arte." }, { status: 400 });
  }
  // Só os campos já dizem o que criar: o pedido em texto sai deles.
  if (!prompt.trim() && obrigatorios.length > 0) {
    prompt = pedidoDosCampos(objetivo, obrigatorios);
  }
  // Referência só ajuda um pedido: sozinha, ela não diz o que criar.
  if (!prompt.trim() && (!arteBaseUrl || modoTransformacao === "referencia")) {
    return NextResponse.json({ error: "Descreva o que você precisa (ou grave o áudio)." }, { status: 400 });
  }
  // Com arte-base o texto é opcional: a escolha de melhorar ou recriar já diz o
  // que fazer, e a arte traz as informações da campanha.
  if (!prompt.trim() && modoTransformacao !== "referencia") {
    prompt = PEDIDO_SEM_TEXTO[modoTransformacao];
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
  if (!TIPOS_IMAGEM_VALIDOS.includes(tipoImagem)) tipoImagem = "ia_decide";

  const { data: cliente } = await supabase
    .from("clientes")
    .select("id, nome, ativo")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cliente) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  // A tela já esconde o botão, mas a regra vale aqui também: a rota é o que
  // de fato gasta API, e um link antigo não pode produzir para quem saiu.
  if (!cliente.ativo) {
    return NextResponse.json(
      { error: "Este cliente está arquivado. Reative antes de produzir." },
      { status: 409 },
    );
  }

  // Gerar não gasta crédito (ele sai na aprovação), mas sem nenhum a arte não
  // teria como ser aprovada. Colaborador não fura a regra: produzir fiado é
  // decisão comercial, então fica com o sócio.
  const saldo = await saldoDoCliente(clienteId);
  const bloqueio = bloqueioDeGeracao(saldo);
  if (bloqueio && !(forcarSemSaldo && perfil.papel === "socio")) {
    return NextResponse.json(
      {
        error: bloqueio,
        saldoInsuficiente: true,
        disponivel: saldo.disponivel,
        necessario: 1,
        podeForcar: perfil.papel === "socio",
        // O áudio já foi transcrito: volta para a tela em vez de se perder.
        transcricao: origem === "audio" ? prompt : undefined,
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
    const produtoDoCliente = (referencias ?? []).some((r) => r.id === produtoRefId && r.tipo === "produto");

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
          tipoImagem,
          variacao: i,
          total: quantidade,
          ...(produtoDoCliente ? { produtoRefId } : {}),
          ...(arteBaseUrl ? { arteBaseUrl, modoTransformacao } : {}),
          ...(objetivo !== "livre" ? { objetivo } : {}),
          ...(obrigatorios.length > 0 ? { obrigatorios } : {}),
        },
        status: "pendente",
      }));

    const { data: criadas, error: erroPecas } = await supabase.from("pecas").insert(pecas).select("id");
    if (erroPecas || !criadas?.length) throw new Error("Falha ao criar as peças.");

    for (const peca of criadas) {
      await enfileirar("gerar_peca", peca.id);
    }

    // Cutuca o worker para começar agora, sem esperar o próximo tique do
    // cron. Se falhar, a tela do pedido insiste e o cron pega em até um
    // minuto — por isso não é erro.
    dispararWorker(request, criadas.length);

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

// Dispara uma invocação do worker por peça, para o lote começar agora e as
// peças saírem em paralelo em vez de uma por tique do cron.
//
// Vai dentro de `after()` porque um `void fetch` solto não sobrevive ao fim da
// função: a Vercel congela a instância assim que a resposta é enviada, e a
// requisição morria antes de sair. Medido em produção — a peça só começava a
// ser gerada quando o cron passava, 44s depois de ter sido enfileirada.
//
// O abort em 3s solta esta função sem matar o worker: a invocação do worker já
// foi criada e segue até o fim por conta própria, porque uma Serverless
// Function não é cancelada quando quem chamou desconecta.
function dispararWorker(request: NextRequest, invocacoes: number) {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : new URL(request.url).origin;
  const segredo = process.env.CRON_SECRET;

  after(async () => {
    await Promise.all(
      Array.from({ length: invocacoes }, () =>
        fetch(`${base}/api/fila/processar`, {
          method: "POST",
          headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
          signal: AbortSignal.timeout(3000),
        }).catch(() => {
          // Esperado: o abort acima. O worker já recebeu a chamada, e de
          // todo jeito o cron e a própria tela do pedido insistem depois.
        }),
      ),
    );
  });
}
