import { createAdminClient } from "@/lib/supabase/admin";
import { montarPrompt, montarPromptMelhorarArteExistente } from "@/lib/ai/prompt-builder";
import { montarOrdemDeAjuste, nomeDaReferenciaDoAjuste } from "@/lib/ai/ajuste-arte";
import {
  contatosParaInstrucao,
  direcaoDosControles,
  identidadeParaInstrucao,
  instrucaoDeVariacao,
  pedidoManualParaBriefing,
} from "@/lib/ai/agente-pedido";
import { DESCRICAO_FORMATO, montarPromptDiretorArte, promptNovoFormato } from "@/lib/ai/diretor-arte";
import { lerArte, recortarDaArte, type LeituraDaArte } from "@/lib/ai/ler-arte";
import { imagemParaLeitura, leituraParaDiretor } from "@/lib/ai/ler-referencias";
import { gerarVariacoes, type EntradaImagem } from "@/lib/ai/openai-image";
import { IMAGE_MODEL, TAMANHO_POR_FORMATO, qualidadeParaEtapa } from "@/lib/ai/models";
import { custoImagemPorUso, custoImagemUSD, custoTextoUSD, registrarGeracao } from "./custo";
import { logosParceirosCitados, mesmoNome } from "./logo-parceiro";
import { orientacaoDoObjetivo, textosObrigatoriosEmTexto } from "./objetivos";
import { operadorEscreveu, type BrandKit, type BriefingPecaManual, type Cliente, type Referencia, type VersaoPeca } from "./types";
import type { Formato } from "@/lib/types";

// Produção de UMA peça, do briefing à imagem salva. Roda no worker da fila
// (sem sessão de usuário), por isso usa o client admin em tudo.
//
// Reaproveita o motor de direção de arte que já existia (montarPrompt +
// gerarVariacoes): a remodelagem trocou quem pede e como pede, não como a
// arte é construída.

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

async function baixarComoEntrada(
  url: string,
  tipo: EntradaImagem["tipo"],
  rotulo?: string,
): Promise<EntradaImagem | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), mimeType, tipo, ...(rotulo ? { rotulo } : {}) };
  } catch (e) {
    // Referência indisponível não pode derrubar a peça inteira: a arte sai
    // sem aquele material, o que é melhor do que não sair.
    console.error("[gerar-peca] falha ao baixar referência:", url, e);
    return null;
  }
}

// Na criação a logo do parceiro entra na arte. No ajuste ela vai só para consulta:
// o pedido pode ser justamente para tirá-la, e o rótulo vem antes da ordem.
function rotuloDoParceiro(nome: string, ajustando: boolean): string {
  return ajustando
    ? `a logo oficial de "${nome}", só para consulta — se a arte tiver ou passar a ter essa logo, use exatamente este desenho, sem redesenhar`
    : `a logo oficial de "${nome}", que o pedido cita — ela entra na arte inteira e legível, reproduzida exatamente como está, sem redesenhar, separada da logo da marca e sem se fundir a ela`;
}

async function baixarParceiros(
  refs: Referencia[],
  ajustando: boolean,
): Promise<{ entrada: EntradaImagem; nome: string }[]> {
  const baixadas = await Promise.all(
    refs.map(async (r) => {
      const nome = (r.descricao ?? "").trim();
      const entrada = await baixarComoEntrada(r.url, "logo_parceiro", rotuloDoParceiro(nome, ajustando));
      return entrada ? { entrada, nome } : null;
    }),
  );
  return baixadas.filter((b): b is { entrada: EntradaImagem; nome: string } => Boolean(b));
}

// Imagens que o operador anexou ao pedido de ajuste. Cada uma leva o nome que a
// ordem de edição usa para dizer o que tirar dela. Sem uma delas, a ordem citaria
// uma imagem que o gerador não recebeu, então a peça falha e a fila tenta de novo.
async function referenciasDoAjuste(urls: string[]): Promise<EntradaImagem[]> {
  const baixadas = await Promise.all(
    urls.map((url, i) =>
      baixarComoEntrada(
        url,
        "referencia_ajuste",
        `a ${nomeDaReferenciaDoAjuste(i + 1)}, anexada pelo operador, e não a arte a ser editada — use dela só o que a ordem abaixo indicar; texto, preço, marca e logo dela não entram na arte se a ordem não pedir`,
      ),
    ),
  );
  if (baixadas.some((b) => !b)) throw new Error("Não consegui abrir uma das imagens anexadas ao ajuste.");
  return baixadas as EntradaImagem[];
}

// Materiais do cliente que entram como imagem de entrada. Limitado de
// propósito: cada imagem extra encarece e alonga a chamada. "parceiros" são os
// nomes das logos de parceiro anexadas, que o diretor de arte precisa encaixar.
async function materiaisDaPeca(
  manual: BriefingPecaManual,
  referencias: Referencia[],
  caminho: { ajustando: boolean; mudandoFormato: boolean; imagemEnviada: boolean },
): Promise<{ entradas: EntradaImagem[]; parceiros: string[] }> {
  const logo = referencias.find((r) => r.tipo === "logo");

  // Logo de programa ou parceiro, como a do CNH do Brasil: só quando o pedido cita o nome.
  // Na troca de formato o gerador redesenha a peça inteira, então vale também o
  // pedido que deu origem a ela: a logo que já estava na arte volta com o desenho certo.
  const citado = caminho.mudandoFormato
    ? `${manual.prompt}\n${manual.instrucaoAjuste ?? ""}`
    : caminho.ajustando
      ? manual.instrucaoAjuste
      : manual.prompt;
  const parceiros = await baixarParceiros(logosParceirosCitados(referencias, citado), caminho.ajustando);
  const nomesParceiros = parceiros.map((p) => p.nome);
  const entradasParceiros = parceiros.map((p) => p.entrada);

  // Ajuste edita uma arte pronta: ela já traz logo e produto, e anexá-los de
  // novo só dá ao modelo motivo para redesenhar o que devia preservar. A logo
  // volta apenas quando o pedido fala dela, para ele ter o desenho certo, ou quando
  // a mudança de formato faz o gerador desenhar a peça de novo.
  if (caminho.ajustando) {
    const pedeLogo = caminho.mudandoFormato || /\b(logo|logotipo|logomarca)\b/i.test(manual.instrucaoAjuste ?? "");
    const [e, anexadas] = await Promise.all([
      logo && pedeLogo ? baixarComoEntrada(logo.url, "logotipo") : null,
      referenciasDoAjuste(manual.imagensAjuste ?? []),
    ]);
    return { entradas: [...(e ? [e] : []), ...entradasParceiros, ...anexadas], parceiros: nomesParceiros };
  }

  const produto = referencias.find((r) => r.id === manual.produtoRefId && r.tipo === "produto");

  // Referência de estilo só na criação sem imagem: com ela, quem dá o tom é a imagem
  // enviada. A que o operador cadastrou manda; sem ela vale a última arte aprovada,
  // que é como os pedidos seguintes saem mais perto do que já agradou.
  const estilo = caminho.imagemEnviada
    ? undefined
    : (referencias.find((r) => r.tipo === "referencia_visual") ??
      referencias.find((r) => r.tipo === "arte_aprovada"));

  const baixadas = await Promise.all([
    produto && baixarComoEntrada(produto.url, "produto"),
    logo && baixarComoEntrada(logo.url, "logotipo"),
    estilo && baixarComoEntrada(estilo.url, "referencia"),
  ]);
  return {
    entradas: [...baixadas.filter((e): e is EntradaImagem => Boolean(e)), ...entradasParceiros],
    parceiros: nomesParceiros,
  };
}

// "Criar nova versão": lê a arte em vez de anexá-la (ver ler-arte.ts) e completa
// as entradas com o recorte do que o cadastro não trouxe. Produto escolhido pelo
// operador e logo cadastrada têm prioridade sobre o recorte.
async function lerArteAntiga(
  arte: EntradaImagem,
  entradas: EntradaImagem[],
  ids: { pecaId: string; pedidoId: string; clienteId: string },
): Promise<LeituraDaArte> {
  const inicio = Date.now();
  const { leitura, uso } = await lerArte(arte);
  await registrarGeracao({
    tipo: "texto",
    modelo: uso.modelo,
    custoUsd: custoTextoUSD(uso.modelo, uso.entrada, uso.saida),
    usageRaw: { entrada: uso.entrada, saida: uso.saida, estimado: false },
    duracaoMs: Date.now() - inicio,
    ...ids,
  });

  if (leitura.recorteProduto && !entradas.some((e) => e.tipo === "produto")) {
    const produto = await recortarDaArte(arte, leitura.recorteProduto, "produto");
    if (produto) entradas.push(produto);
  }
  if (leitura.recorteLogo && !entradas.some((e) => e.tipo === "logotipo")) {
    const logo = await recortarDaArte(arte, leitura.recorteLogo, "logotipo");
    if (logo) entradas.push(logo);
  }
  return leitura;
}

async function subirImagem(clienteId: string, base64: string): Promise<string> {
  const supabase = createAdminClient();
  const nome = `${crypto.randomUUID()}.png`;
  const path = `agencia/${clienteId}/${nome}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(base64, "base64"), { contentType: "image/png", upsert: false });
  if (error) {
    console.error("[gerar-peca] upload falhou:", error);
    throw new Error("Falha ao salvar a imagem no Storage.");
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export interface ResultadoGeracaoPeca {
  imagemUrl: string;
  promptUsado: string;
}

export async function gerarPeca(pecaId: string): Promise<ResultadoGeracaoPeca> {
  const supabase = createAdminClient();

  const { data: peca } = await supabase.from("pecas").select("*").eq("id", pecaId).maybeSingle();
  if (!peca) throw new Error("Peça não encontrada.");

  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", peca.cliente_id)
    .maybeSingle();
  if (!cliente) throw new Error("Cliente não encontrado.");

  const { data: brandKit } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("cliente_id", peca.cliente_id)
    .maybeSingle();

  const { data: referenciasRaw } = await supabase
    .from("referencias")
    .select("*")
    .eq("cliente_id", peca.cliente_id)
    // Mais recente primeiro: logo trocada e última arte aprovada são as que valem.
    .order("created_at", { ascending: false });

  const referencias = (referenciasRaw ?? []) as Referencia[];
  await supabase.from("pecas").update({ status: "gerando", erro: null }).eq("id", pecaId);

  const manual = (peca.briefing ?? {}) as BriefingPecaManual;
  const formato: Formato = manual.formatoNovo ?? manual.formato ?? "feed-4-5";

  // Caminhos possíveis, nesta ordem de precedência:
  //
  // 1. Ajuste — o operador pediu uma mudança numa peça entregue. Edita AQUELA imagem
  //    e preserva o resto. Pedido de outro formato refaz a peça na nova proporção.
  // 2. Melhorar arte-base — ele subiu uma peça pronta, que vai anexada.
  // 3. Criação do zero pelo diretor de arte. "Criar nova versão" cai aqui: a arte
  //    enviada é lida, não anexada, e o diretor recria a campanha com o que ela dizia.
  //    Referência também: o diretor e o gerador veem a imagem, e o pedido manda.
  //
  // O ajuste vem primeiro porque é o mais específico: a peça de um ajuste
  // pode ter nascido de uma arte-base, e nesse caso o que vale é a imagem que
  // ele está olhando agora, não a que originou a peça.
  const ajustando = Boolean(manual.ajusteSobreUrl && manual.instrucaoAjuste);
  const mudandoFormato = ajustando && Boolean(manual.formatoNovo);
  const comoReferencia = !ajustando && Boolean(manual.arteBaseUrl) && manual.modoTransformacao === "referencia";
  const urlDeEntrada = ajustando ? manual.ajusteSobreUrl : comoReferencia ? undefined : manual.arteBaseUrl;
  const transformandoArte = Boolean(urlDeEntrada);
  const novaVersao = !ajustando && transformandoArte && manual.modoTransformacao === "nova_versao_criativa";

  const { entradas, parceiros } = await materiaisDaPeca(manual, referencias, {
    ajustando,
    mudandoFormato,
    imagemEnviada: transformandoArte || comoReferencia,
  });

  let imagemDoPedido: string | undefined;
  if (comoReferencia) {
    const [referencia, paraDiretor] = await Promise.all([
      baixarComoEntrada(manual.arteBaseUrl!, "referencia_pedido"),
      imagemParaLeitura(manual.arteBaseUrl!),
    ]);
    if (!referencia || !paraDiretor) throw new Error("Não consegui abrir a imagem de referência.");
    entradas.push(referencia);
    imagemDoPedido = paraDiretor;
  }

  let arteAntiga: LeituraDaArte | undefined;
  if (urlDeEntrada) {
    const papel = mudandoFormato ? "arte_novo_formato" : ajustando ? "base" : "arte_melhorar";
    const base = await baixarComoEntrada(urlDeEntrada, papel);
    if (!base) throw new Error("Não consegui ler a arte usada como base.");
    if (novaVersao) {
      arteAntiga = await lerArteAntiga(base, entradas, {
        pecaId: peca.id,
        pedidoId: peca.pedido_id,
        clienteId: peca.cliente_id,
      });
    } else {
      // A arte-base vai na frente: é a referência principal da geração.
      entradas.unshift(base);
    }
  }

  // Na nova versão os textos da arte antiga voltam para a peça. Se eles citam o
  // parceiro, a logo dele volta junto, mesmo que o operador não tenha escrito o nome.
  if (arteAntiga) {
    const faltam = logosParceirosCitados(referencias, arteAntiga.textos.join("\n")).filter(
      (r) => !parceiros.some((nome) => mesmoNome(nome, r.descricao ?? "")),
    );
    for (const p of await baixarParceiros(faltam, false)) {
      entradas.push(p.entrada);
      parceiros.push(p.nome);
    }
  }

  // O que de fato foi anexado manda, não o que o cadastro promete: se a
  // referência não baixou, o prompt não pode prometer foto ao modelo.
  const anexos = {
    temFotoProduto: entradas.some((e) => e.tipo === "produto"),
    temLogotipo: entradas.some((e) => e.tipo === "logotipo"),
    temReferencia: entradas.some((e) => e.tipo === "referencia"),
  };

  const briefing = pedidoManualParaBriefing(manual, cliente as Cliente, (brandKit as BrandKit) ?? null, anexos);
  const arteDoAjuste = entradas.find((e) => e.tipo === "base");

  // 1) Prompt (custo de texto)
  const inicioPrompt = Date.now();
  const { prompts, uso } = mudandoFormato
    ? { prompts: [promptNovoFormato(formato, manual.instrucaoAjuste!)], uso: undefined }
    : arteDoAjuste
      ? await montarOrdemDeAjuste(
          arteDoAjuste,
          manual.instrucaoAjuste!,
          entradas.filter((e) => e.tipo === "referencia_ajuste"),
        ).then((r) => ({
          prompts: [r.prompt],
          uso: r.uso,
        }))
      : transformandoArte && !novaVersao
        ? await montarPromptMelhorarArteExistente({
            direcao: "personalizado",
            ordem: operadorEscreveu(manual.prompt) ? manual.prompt : undefined,
            formatoSaida: DESCRICAO_FORMATO[formato],
            instrucaoUsuario: [
              identidadeParaInstrucao(cliente as Cliente, (brandKit as BrandKit) ?? null),
              direcaoDosControles(manual),
              orientacaoDoObjetivo(manual.objetivo) && `Objetivo da peça: ${orientacaoDoObjetivo(manual.objetivo)}`,
              textosObrigatoriosEmTexto(manual.obrigatorios) &&
                `Textos obrigatórios, que entram na arte exatamente como estão escritos:\n${textosObrigatoriosEmTexto(manual.obrigatorios)}`,
              instrucaoDeVariacao(manual.variacao, manual.total),
            ]
              .filter(Boolean)
              .join("\n\n"),
          }).then((r) => ({ prompts: [r.prompt], uso: r.uso }))
        : await criarComDiretorArte(manual, cliente as Cliente, (brandKit as BrandKit) ?? null, {
            ...anexos,
            briefingLegado: briefing,
            arteAntiga,
            imagemDoPedido,
            logosParceiros: parceiros,
          });

  // O novo formato não chama modelo de texto, então não há custo a registrar.
  if (!mudandoFormato) {
    // Tokens reais quando a chamada respondeu; a estimativa só entra quando o
    // prompt veio do fallback determinístico (sem chamada, logo sem custo real).
    const modeloTexto = uso?.modelo ?? "gpt-5.4";
    await registrarGeracao({
      tipo: "texto",
      modelo: modeloTexto,
      custoUsd: uso
        ? custoTextoUSD(modeloTexto, uso.entrada, uso.saida)
        : custoTextoUSD(modeloTexto, 3000, 1200),
      usageRaw: uso ? { entrada: uso.entrada, saida: uso.saida, estimado: false } : { estimado: true },
      duracaoMs: Date.now() - inicioPrompt,
      pecaId: peca.id,
      pedidoId: peca.pedido_id,
      clienteId: peca.cliente_id,
    });
  }

  // 2) Imagem
  // Só o ajuste copia a tipografia que já está na arte. Melhorar, recriar ou mudar de
  // formato desenha layout e texto de novo: é criação, não edição. Ver models.ts.
  const qualidade = qualidadeParaEtapa(ajustando && !mudandoFormato ? "edicao" : "final");
  const inicioImagem = Date.now();
  let imagens;
  try {
    imagens = await gerarVariacoes({
      prompts: [prompts[0]],
      imagens: entradas,
      tamanho: TAMANHO_POR_FORMATO[formato],
      qualidade,
    });
  } catch (e) {
    await registrarGeracao({
      tipo: "imagem",
      modelo: IMAGE_MODEL,
      qualidade,
      tamanho: TAMANHO_POR_FORMATO[formato],
      custoUsd: custoImagemUSD(IMAGE_MODEL, qualidade),
      duracaoMs: Date.now() - inicioImagem,
      sucesso: false,
      erro: e instanceof Error ? e.message : String(e),
      pecaId: peca.id,
      pedidoId: peca.pedido_id,
      clienteId: peca.cliente_id,
    });
    throw e;
  }

  await registrarGeracao({
    tipo: "imagem",
    modelo: IMAGE_MODEL,
    qualidade,
    tamanho: TAMANHO_POR_FORMATO[formato],
    custoUsd: imagens[0].uso
      ? custoImagemPorUso(IMAGE_MODEL, imagens[0].uso)
      : custoImagemUSD(IMAGE_MODEL, qualidade),
    usageRaw: imagens[0].uso ? { ...imagens[0].uso, estimado: false } : { estimado: true },
    duracaoMs: Date.now() - inicioImagem,
    pecaId: peca.id,
    pedidoId: peca.pedido_id,
    clienteId: peca.cliente_id,
  });

  // Gerar não gasta crédito: ele sai quando a arte é aprovada (ver aprovarPeca).
  const imagemUrl = await subirImagem(peca.cliente_id, imagens[0].base64);

  // Relê o briefing: o operador pode ter pedido outro ajuste enquanto esta arte saía.
  const { data: atual } = await supabase.from("pecas").select("briefing").eq("id", pecaId).maybeSingle();
  const briefingFinal: BriefingPecaManual = {
    ...((atual?.briefing ?? manual) as BriefingPecaManual),
    formato,
    versoes: versoesComANova(peca, {
      url: imagemUrl,
      criadaEm: new Date().toISOString(),
      formato,
      ajuste: ajustando ? manual.instrucaoAjuste : undefined,
      ...(ajustando && manual.imagensAjuste?.length ? { imagensAjuste: manual.imagensAjuste } : {}),
      promptUsado: imagens[0].promptUsado,
    }),
  };
  delete briefingFinal.formatoNovo;

  await supabase
    .from("pecas")
    .update({
      status: "gerada",
      imagem_url: imagemUrl,
      prompt_usado: imagens[0].promptUsado,
      erro: null,
      briefing: briefingFinal,
    })
    .eq("id", pecaId);

  await encerrarPedidoSePronto(peca.pedido_id);

  return { imagemUrl, promptUsado: imagens[0].promptUsado };
}

// Peça criada antes de existir a lista começa pela imagem que já tinha.
function versoesComANova(
  peca: { imagem_url: string | null; prompt_usado: string | null; created_at: string; briefing: unknown },
  nova: VersaoPeca,
): VersaoPeca[] {
  const manual = (peca.briefing ?? {}) as BriefingPecaManual;
  const versoes = manual.versoes ?? [];
  if (versoes.length > 0 || !peca.imagem_url) return [...versoes, nova];
  return [
    {
      url: peca.imagem_url,
      criadaEm: peca.created_at,
      formato: manual.formato ?? "feed-4-5",
      promptUsado: peca.prompt_usado ?? undefined,
    },
    nova,
  ];
}

// Pedido concluído quando nenhuma peça segue pendente/gerando. Vale também para
// a peça que falhou de vez: sem isso o pedido ficaria "processando" para sempre.
export async function encerrarPedidoSePronto(pedidoId: string): Promise<void> {
  const supabase = createAdminClient();
  const { data: restantes } = await supabase
    .from("pecas")
    .select("id")
    .eq("pedido_id", pedidoId)
    .in("status", ["pendente", "gerando"]);

  if (!restantes || restantes.length === 0) {
    await supabase
      .from("pedidos")
      .update({ status: "concluido", concluido_em: new Date().toISOString() })
      .eq("id", pedidoId);
  }
}

// Criação do zero pelo diretor de arte. O prompt antigo (montarPrompt) fica
// como rede: se o diretor falhar — API fora, JSON quebrado, ficha vazia — a
// peça ainda sai, em vez de o cliente ficar sem entrega.
async function criarComDiretorArte(
  manual: BriefingPecaManual,
  cliente: Cliente,
  brandKit: BrandKit | null,
  ctx: {
    temFotoProduto: boolean;
    temLogotipo: boolean;
    temReferencia: boolean;
    briefingLegado: Parameters<typeof montarPrompt>[0];
    arteAntiga?: LeituraDaArte;
    imagemDoPedido?: string;
    logosParceiros: string[];
  },
): Promise<{ prompts: string[]; uso?: { modelo: string; entrada: number; saida: number } }> {
  try {
    const r = await montarPromptDiretorArte({
      empresa: cliente.nome,
      nicho: cliente.nicho,
      pedido: manual.prompt,
      identidade: identidadeParaInstrucao(cliente, brandKit),
      // Só a guardada: reler aqui gastaria o tempo que a peça precisa para sair.
      referencias: brandKit?.direcao_arte ? leituraParaDiretor(brandKit.direcao_arte) : undefined,
      direcaoVisual: direcaoDosControles(manual),
      objetivo: orientacaoDoObjetivo(manual.objetivo),
      textosObrigatorios: textosObrigatoriosEmTexto(manual.obrigatorios),
      contatos: contatosParaInstrucao(brandKit),
      formato: manual.formato ?? "feed-4-5",
      temFotoProduto: ctx.temFotoProduto,
      temLogotipo: ctx.temLogotipo,
      temReferencia: ctx.temReferencia,
      variacao: { indice: manual.variacao ?? 0, total: manual.total ?? 1 },
      arteAntiga: ctx.arteAntiga,
      operadorEscreveu: operadorEscreveu(manual.prompt),
      imagemDoPedido: ctx.imagemDoPedido,
      logosParceiros: ctx.logosParceiros,
    });
    return { prompts: [r.prompt], uso: r.uso };
  } catch (e) {
    // O montador antigo não conhece os textos da arte lida: a fila tentar de novo
    // é melhor do que entregar uma peça sem as informações do cliente.
    if (ctx.arteAntiga) throw e;
    console.error("[gerar-peca] diretor de arte falhou, usando o montador antigo:", e);
    return montarPrompt(ctx.briefingLegado);
  }
}
