import OpenAI from "openai";
import { rotaDeVariacao } from "./diretor-arte";
import { ESTILOS_COMUNICACAO, INTENSIDADES_VISUAIS, textoEnvolveComida } from "./prompt-builder";
import type { BriefingCompleto, TipoPeca } from "@/lib/types";
import type { BrandKit, BriefingPecaManual, Cliente, Referencia } from "@/lib/agencia/types";

// Ponte entre o pedido do operador e o motor de direção de arte
// (prompt-builder). O operador escreve ou fala o que precisa e ajusta os
// controles; aqui isso vira um briefing completo, já temperado com o perfil
// do cliente.
//
// Antes existia um planejador que recebia "faça 5 artes pra semana" e
// decidia sozinho quantas peças fazer e o que cada uma diria. Saiu de cena
// porque engessava: quem conhece o cliente é o operador, e ele precisa pedir
// exatamente o que quer, não aprovar o palpite de um agente.

// ---------------------------------------------------------------------------
// Perfil do cliente -> instruções que o prompt-builder entende
// ---------------------------------------------------------------------------

// Regras que o agente trata como inegociáveis. Ficam em observacaoUsuario
// porque o prompt-builder já repassa esse campo como pedido explícito do
// lojista, que é exatamente o peso que elas precisam ter.
function regrasDoCliente(brandKit: BrandKit | null): string[] {
  if (!brandKit) return [];
  const linhas: string[] = [];

  if (brandKit.regras_obrigatorias?.length) {
    linhas.push(`Regras obrigatórias da marca (nunca descumprir): ${brandKit.regras_obrigatorias.join("; ")}`);
  }
  if (brandKit.estilo_visual?.trim()) {
    linhas.push(`Estilo visual da marca: ${brandKit.estilo_visual.trim()}`);
  }
  if (brandKit.tom_de_voz?.trim()) {
    linhas.push(`Tom de voz da marca: ${brandKit.tom_de_voz.trim()}`);
  }
  if (brandKit.tipografia?.trim()) {
    linhas.push(`Preferência tipográfica: ${brandKit.tipografia.trim()}`);
  }
  return linhas;
}

// Quando o operador pede mais de uma imagem, cada peça precisa buscar uma
// saída diferente — senão voltam variações quase idênticas e o cliente
// recebe a mesma arte três vezes.
export function instrucaoDeVariacao(variacao: number, total: number): string | null {
  if (total <= 1) return null;
  return `Esta é a peça ${variacao + 1} de ${total} do mesmo pedido. ${rotaDeVariacao(variacao)} Mesmas informações, direção criativa diferente.`;
}

// O prompt-builder espera um "produto" curto para montar a hierarquia da
// peça. Em vez de gastar uma chamada de modelo só para extrair isso, usa o
// começo do próprio pedido — que é onde o operador naturalmente diz o que
// está anunciando ("promoção de hambúrguer artesanal no combo…"). O pedido
// completo segue em descricaoProduto, então nada se perde.
function resumirProduto(prompt: string): string {
  const limpo = prompt.replace(/\s+/g, " ").trim();
  // Corta na primeira pontuação forte: costuma separar o produto do resto
  // das condições comerciais.
  const primeiraParte = limpo.split(/[.;\n]|\s-\s/)[0] ?? limpo;
  const base = primeiraParte.length >= 8 ? primeiraParte : limpo;
  return base.length > 80 ? `${base.slice(0, 80).trim()}…` : base;
}

function inferirTipoPeca(texto: string): TipoPeca {
  const t = texto.toLowerCase();
  if (/lan[çc]amento|novidade|chegou|novo /.test(t)) return "lancamento";
  if (/promo|desconto|oferta|combo|r\$|barat/.test(t)) return "promocao";
  if (/natal|p[áa]scoa|dia d[aeo]|feriado|anivers|m[ãa]es|pais/.test(t)) return "data-comemorativa";
  if (/servi[çc]o|atendimento|agende|hor[áa]rio/.test(t)) return "anuncio-servico";
  return "anuncio-produto";
}

// Monta o briefing de UMA peça a partir do pedido manual + perfil do cliente.
export function pedidoManualParaBriefing(
  manual: BriefingPecaManual,
  cliente: Cliente,
  brandKit: BrandKit | null,
  opcoes: { temFotoProduto?: boolean; temLogotipo?: boolean; temReferencia?: boolean } = {},
): BriefingCompleto {
  const contextoComida = `${cliente.nicho ?? ""} ${manual.prompt}`;
  const temCores = Boolean(brandKit?.cores_primarias?.trim());

  const observacoes = [
    ...regrasDoCliente(brandKit),
    instrucaoDeVariacao(manual.variacao, manual.total),
  ].filter(Boolean) as string[];

  return {
    tipoPeca: inferirTipoPeca(manual.prompt),
    // O produto anunciado vem do PEDIDO, nunca do nome da empresa.
    // Passar cliente.nome aqui fazia o prompt-builder montar
    // "Produto: Burger do Zé" e o modelo tratar a loja como se fosse o
    // produto da peça — a marca entra como assinatura, lá embaixo.
    nomeProduto: resumirProduto(manual.prompt),
    descricaoProduto: manual.prompt,
    segmentoDetectado: cliente.nicho ?? undefined,
    formato: manual.formato,
    objetivo: "instagram",
    objetivoMarketing: "vender_rapido",

    // Controles que o operador ajustou na tela.
    estiloComunicacao: manual.estilo ?? "ia_decide",
    intensidadeVisual: manual.intensidade ?? "ia_decide",
    nivelProducaoVisual: "premium-editorial",

    // Cor: paleta cadastrada manda; sem ela, o diretor de arte decide pelo
    // segmento em vez de inventar identidade que o cliente não tem.
    preferenciaCores: temCores ? "marca" : "segmento",
    coresMarca: brandKit?.cores_primarias ?? undefined,

    modoComidaRealista: textoEnvolveComida(contextoComida),

    // O pedido do operador é a fonte do conteúdo textual. "melhorar_ideia"
    // deixa o redator organizar a copy, sem poder inventar preço, telefone
    // ou promoção que não foram ditos.
    conteudoComposicao: { textoUsuario: manual.prompt, modoUso: "melhorar_ideia" },
    conteudoAnuncio: {
      informacoesSecundarias: [manual.prompt],
      contato: brandKit?.whatsapp ?? undefined,
      endereco: brandKit?.endereco ?? undefined,
      assinaturaMarca: cliente.nome,
    },

    direcaoArte: brandKit?.regras_proibidas?.length
      ? { restricoesEsteticas: brandKit.regras_proibidas }
      : undefined,

    observacaoUsuario: observacoes.length > 0 ? observacoes.join(" | ") : undefined,

    temFotoProduto: opcoes.temFotoProduto ?? false,
    temLogotipo: opcoes.temLogotipo ?? false,
    temReferencia: opcoes.temReferencia ?? false,
  };
}

// Resumo curto do pedido, para dar título ao registro sem o operador precisar
// nomear nada.
export function tituloDoPedido(prompt: string, qtd: number): string {
  const limpo = prompt.replace(/\s+/g, " ").trim();
  const base = limpo.length > 70 ? `${limpo.slice(0, 70)}…` : limpo;
  return qtd > 1 ? `${base} (${qtd} peças)` : base;
}

// O que o cliente tem cadastrado. Arte aprovada conta como referência porque
// é o que a geração usa quando não há referência visual (ver gerar-peca.ts).
export function materiaisDisponiveis(referencias: Referencia[]) {
  return {
    temFotoProduto: referencias.some((r) => r.tipo === "produto"),
    temLogotipo: referencias.some((r) => r.tipo === "logo"),
    temReferencia: referencias.some((r) => r.tipo === "referencia_visual" || r.tipo === "arte_aprovada"),
  };
}

// Os botões de estilo e impacto da tela, em texto. "IA decide" não vira
// instrução nenhuma: nesse caso quem resolve é o nicho e o pedido.
export function direcaoDosControles(manual: BriefingPecaManual): string | undefined {
  const partes: string[] = [];
  if (manual.estilo && manual.estilo !== "ia_decide") {
    partes.push(`Estilo visual: ${ESTILOS_COMUNICACAO[manual.estilo]}`);
  }
  if (manual.intensidade && manual.intensidade !== "ia_decide") {
    partes.push(`Impacto visual: ${INTENSIDADES_VISUAIS[manual.intensidade]}`);
  }
  return partes.length > 0 ? partes.join("\n") : undefined;
}

// Contatos cadastrados em texto. Separados da identidade porque não são regra
// de marca: entram na arte quando o pedido ou uma regra obrigatória pedir, e aí
// precisam estar à mão, já que o diretor de arte não pode inventar telefone.
export function contatosParaInstrucao(brandKit: BrandKit | null): string | undefined {
  const partes = [
    brandKit?.whatsapp?.trim() && `WhatsApp: ${brandKit.whatsapp.trim()}`,
    brandKit?.instagram?.trim() && `Instagram: ${brandKit.instagram.trim()}`,
    brandKit?.endereco?.trim() && `Endereço: ${brandKit.endereco.trim()}`,
    brandKit?.horario_funcionamento?.trim() && `Horário: ${brandKit.horario_funcionamento.trim()}`,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join("\n") : undefined;
}

// ---------------------------------------------------------------------------
// Transcrição de áudio
// ---------------------------------------------------------------------------
// O operador fala o pedido em vez de digitar. Custo irrisório perto de uma
// geração de imagem e economiza o passo mais chato da operação.
export async function transcreverAudio(
  arquivo: File,
): Promise<{ texto: string; duracaoSegundos: number | null }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");

  const openai = new OpenAI({ apiKey, timeout: 120_000 });
  const resposta = await openai.audio.transcriptions.create({
    file: arquivo,
    model: "whisper-1",
    language: "pt",
  });

  return {
    texto: resposta.text,
    duracaoSegundos: (resposta as unknown as { duration?: number }).duration ?? null,
  };
}

// Identidade do cliente em texto corrido, para quem não recebe o briefing inteiro:
// o diretor de arte e o prompt de melhorar arte-base.
export function identidadeParaInstrucao(
  cliente: Cliente,
  brandKit: BrandKit | null,
): string {
  const partes: string[] = [`Empresa: ${cliente.nome}`];
  if (cliente.nicho?.trim()) partes.push(`Ramo: ${cliente.nicho.trim()}`);
  if (brandKit?.cores_primarias?.trim()) {
    partes.push(`Cores primárias da marca: ${brandKit.cores_primarias.trim()}`);
  }
  if (brandKit?.cores_secundarias?.trim()) {
    partes.push(`Cores secundárias: ${brandKit.cores_secundarias.trim()}`);
  }
  partes.push(...regrasDoCliente(brandKit));
  if (brandKit?.regras_proibidas?.length) {
    partes.push(`Nunca usar: ${brandKit.regras_proibidas.join("; ")}`);
  }
  return partes.join("\n");
}
