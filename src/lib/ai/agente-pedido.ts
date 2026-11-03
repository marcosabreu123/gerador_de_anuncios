import OpenAI from "openai";
import { textoEnvolveComida } from "./prompt-builder";
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
function instrucaoDeVariacao(variacao: number, total: number): string | null {
  if (total <= 1) return null;
  return `Esta é a peça ${variacao + 1} de ${total} do mesmo pedido. Proponha uma solução visual claramente distinta das outras: mude conceito, enquadramento, composição e hierarquia. Mesmas informações, direção criativa diferente.`;
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
    // O nome do produto vem do próprio pedido: é o operador quem sabe o que
    // está anunciando, e forçar um campo separado só criaria mais fricção.
    nomeProduto: cliente.nome,
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

// Conta quantas referências de cada tipo o cliente tem — define o que entra
// como imagem de entrada na geração.
export function materiaisDisponiveis(referencias: Referencia[]) {
  return {
    temFotoProduto: referencias.some((r) => r.tipo === "produto"),
    temLogotipo: referencias.some((r) => r.tipo === "logo"),
    temReferencia: referencias.some((r) => r.tipo === "referencia_visual"),
  };
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
