import OpenAI from "openai";
import { criarCompletionComRetry } from "./completions";
import { TEXT_AGENT_MODEL } from "./models";
import { textoEnvolveComida } from "./prompt-builder";
import type { BriefingCompleto, Formato, TipoPeca } from "@/lib/types";
import type { BrandKit, Cliente, PecaPlanejada, PlanoPedido, Referencia } from "@/lib/agencia/types";

// Agente de pedido. Substitui o assistente conversacional de 7 etapas do
// modelo antigo (agente-conversa.ts), que entrevistava o lojista pergunta a
// pergunta para produzir UMA imagem.
//
// Aqui a lógica se inverte: quem pede é o operador, que já conhece o cliente,
// e pede várias peças de uma vez ("5 artes pra semana"). O agente não
// entrevista — ele PLANEJA o lote a partir de um pedido solto e do perfil do
// cliente, e devolve o plano para aprovação antes de gastar qualquer geração.

// ---------------------------------------------------------------------------
// Contexto do cliente
// ---------------------------------------------------------------------------
// Transforma brand kit + referências no texto que o agente lê para gerar "no
// estilo daquela empresa". É o que diferencia esta operação de qualquer
// gerador genérico: a identidade entra em toda peça sem o operador redigitar.
export function montarContextoCliente(
  cliente: Cliente,
  brandKit: BrandKit | null,
  referencias: Referencia[] = [],
): string {
  const linhas: string[] = [`Cliente: ${cliente.nome}`];
  if (cliente.nicho) linhas.push(`Nicho: ${cliente.nicho}`);
  if (cliente.observacoes) linhas.push(`Observações sobre o cliente: ${cliente.observacoes}`);

  if (brandKit) {
    if (brandKit.estilo_visual) linhas.push(`Estilo visual da marca: ${brandKit.estilo_visual}`);
    if (brandKit.cores_primarias) linhas.push(`Cores primárias: ${brandKit.cores_primarias}`);
    if (brandKit.cores_secundarias) linhas.push(`Cores secundárias: ${brandKit.cores_secundarias}`);
    if (brandKit.tipografia) linhas.push(`Tipografia: ${brandKit.tipografia}`);
    if (brandKit.tom_de_voz) linhas.push(`Tom de voz: ${brandKit.tom_de_voz}`);

    const comerciais = [
      brandKit.whatsapp && `WhatsApp: ${brandKit.whatsapp}`,
      brandKit.endereco && `Endereço: ${brandKit.endereco}`,
      brandKit.horario_funcionamento && `Horário: ${brandKit.horario_funcionamento}`,
      brandKit.instagram && `Instagram: ${brandKit.instagram}`,
    ].filter(Boolean);
    if (comerciais.length > 0) {
      linhas.push(`Informações comerciais fixas do cliente: ${comerciais.join(" | ")}`);
    }

    // Regras duras vêm por último e marcadas como inegociáveis: é o que o
    // operador cadastrou justamente para não ter que repetir ("sempre mostrar
    // o WhatsApp", "nunca usar fundo roxo").
    if (brandKit.regras_obrigatorias?.length) {
      linhas.push(`REGRAS OBRIGATÓRIAS (nunca descumprir): ${brandKit.regras_obrigatorias.join("; ")}`);
    }
    if (brandKit.regras_proibidas?.length) {
      linhas.push(`REGRAS PROIBIDAS (nunca fazer): ${brandKit.regras_proibidas.join("; ")}`);
    }
  }

  const aprovadas = referencias.filter((r) => r.tipo === "arte_aprovada").length;
  if (aprovadas > 0) {
    linhas.push(
      `Este cliente tem ${aprovadas} arte(s) já aprovada(s) no histórico — mantenha coerência com o padrão visual que já funcionou para ele.`,
    );
  }

  return linhas.join("\n");
}

// ---------------------------------------------------------------------------
// Planejamento do lote
// ---------------------------------------------------------------------------
const SYSTEM_PLANEJADOR = `Você é diretor de criação de uma agência que produz artes publicitárias para pequenos negócios brasileiros (fast-food, gastrobar, açougue, lanchonete, delivery e outros nichos).

Um operador da agência vai te passar um pedido solto — muitas vezes transcrito de um áudio, então pode vir informal, com repetição, correção no meio da frase e sem estrutura. Sua função é transformar isso num PLANO DE PRODUÇÃO: quantas peças serão feitas e o que cada uma comunica.

## Como planejar
- Identifique QUANTAS peças o operador quer. Se ele disser "cinco artes, uma pra cada dia", são 5 peças. Se não ficar claro, use o bom senso do que foi pedido e não invente volume extra.
- Cada peça precisa ter um propósito próprio e distinto. Cinco peças da mesma campanha não podem ser cinco variações da mesma frase — cada dia/oferta tem seu próprio gancho.
- Use as informações do cliente (identidade, informações comerciais, regras) como base, mas NUNCA invente dado comercial que o operador não forneceu: preço, telefone, endereço e promoção só entram se vierem do pedido ou do cadastro do cliente.
- Se o operador citou preço/oferta específicos por dia, respeite exatamente. Preço é informação crítica: nunca arredonde, nunca troque.

## Campos de cada peça
- "titulo": nome curto e interno da peça, para o operador reconhecer na lista (ex: "Segunda — combo burger + fritas").
- "objetivo": o que essa peça precisa alcançar comercialmente (ex: "atrair movimento na segunda, dia mais fraco").
- "conteudo": tudo que deve aparecer escrito na arte — chamada, oferta, preço, CTA e contato quando fizer sentido. Escreva de forma organizada e pronta para virar arte.
- "observacoes": direção visual específica dessa peça, quando houver (opcional).

## Saída — APENAS JSON válido, sem markdown e sem texto fora do JSON:
{
  "resumo": "uma frase dizendo o que será produzido no lote",
  "pecas": [
    { "titulo": "...", "objetivo": "...", "conteudo": "...", "observacoes": "..." }
  ]
}`;

const MAX_PECAS_POR_PEDIDO = 12;

function sanitizarPlano(bruto: unknown): PlanoPedido | null {
  if (!bruto || typeof bruto !== "object") return null;
  const obj = bruto as Record<string, unknown>;
  if (!Array.isArray(obj.pecas)) return null;

  const pecas: PecaPlanejada[] = [];
  for (const item of obj.pecas.slice(0, MAX_PECAS_POR_PEDIDO)) {
    if (!item || typeof item !== "object") continue;
    const p = item as Record<string, unknown>;
    const titulo = typeof p.titulo === "string" ? p.titulo.trim() : "";
    const conteudo = typeof p.conteudo === "string" ? p.conteudo.trim() : "";
    // Sem título ou sem conteúdo a peça não tem o que virar arte — descarta
    // em vez de gerar algo vazio e cobrar do pacote do cliente por isso.
    if (!titulo || !conteudo) continue;
    pecas.push({
      titulo,
      conteudo,
      objetivo: typeof p.objetivo === "string" ? p.objetivo.trim() : "",
      observacoes: typeof p.observacoes === "string" ? p.observacoes.trim() : undefined,
    });
  }

  if (pecas.length === 0) return null;
  return {
    resumo: typeof obj.resumo === "string" ? obj.resumo.trim() : `${pecas.length} peça(s) planejada(s)`,
    pecas,
  };
}

export interface ResultadoPlanejamento {
  plano: PlanoPedido;
  usageRaw: Record<string, unknown> | null;
  modelo: string;
}

export async function planejarPedido(
  pedidoTexto: string,
  contextoCliente: string,
): Promise<ResultadoPlanejamento> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");

  const openai = new OpenAI({ apiKey, timeout: 60_000 });
  const completion = await criarCompletionComRetry(openai, {
    model: TEXT_AGENT_MODEL,
    temperature: 0.6,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PLANEJADOR },
      {
        role: "system",
        content: `Perfil do cliente para quem as peças serão produzidas:\n${contextoCliente}`,
      },
      { role: "user", content: pedidoTexto },
    ],
  });

  const texto = completion.choices[0]?.message?.content;
  if (!texto) throw new Error("O agente não retornou um plano.");

  let plano: PlanoPedido | null = null;
  try {
    plano = sanitizarPlano(JSON.parse(texto));
  } catch (e) {
    console.error("[agente-pedido] plano não é JSON válido:", e, texto);
  }
  if (!plano) throw new Error("Não consegui entender o pedido. Tente descrever com mais detalhe.");

  return {
    plano,
    usageRaw: (completion.usage as unknown as Record<string, unknown>) ?? null,
    modelo: TEXT_AGENT_MODEL,
  };
}

// ---------------------------------------------------------------------------
// Peça planejada -> briefing do prompt-builder
// ---------------------------------------------------------------------------
// Ponte entre o modelo novo e o motor de direção de arte que já existe. Todo
// o trabalho calibrado do prompt-builder (anti-panfleto, comida realista,
// acabamento profissional) é reaproveitado — nada disso é reescrito.
export function pecaParaBriefing(
  peca: PecaPlanejada,
  cliente: Cliente,
  brandKit: BrandKit | null,
  opcoes: { formato?: Formato; temFotoProduto?: boolean; temLogotipo?: boolean } = {},
): BriefingCompleto {
  const contextoComida = `${cliente.nicho ?? ""} ${peca.titulo} ${peca.conteudo}`;

  // Cor: se o cliente tem paleta cadastrada, ela manda. Senão, deixa o
  // diretor de arte decidir pelo segmento.
  const temCores = Boolean(brandKit?.cores_primarias?.trim());

  return {
    tipoPeca: inferirTipoPeca(peca),
    nomeProduto: peca.titulo,
    descricaoProduto: peca.objetivo || undefined,
    segmentoDetectado: cliente.nicho ?? undefined,
    formato: opcoes.formato ?? "feed-4-5",
    objetivo: "instagram",
    objetivoMarketing: "vender_rapido",
    preferenciaCores: temCores ? "marca" : "segmento",
    coresMarca: brandKit?.cores_primarias ?? undefined,
    estiloComunicacao: "ia_decide",
    intensidadeVisual: "ia_decide",
    nivelProducaoVisual: "premium-editorial",


    modoComidaRealista: textoEnvolveComida(contextoComida),
    conteudoComposicao: { textoUsuario: peca.conteudo, modoUso: "melhorar_ideia" },
    conteudoAnuncio: {
      headline: peca.titulo,
      // O conteúdo completo entra como informação secundária para o
      // prompt-builder organizar em hierarquia (ele já sabe fazer isso).
      informacoesSecundarias: [peca.conteudo],
      cta: brandKit?.whatsapp ? "Peça pelo WhatsApp" : undefined,
      contato: brandKit?.whatsapp ?? undefined,
      endereco: brandKit?.endereco ?? undefined,
      assinaturaMarca: cliente.nome,
    },
    observacaoUsuario: peca.observacoes,
    temFotoProduto: opcoes.temFotoProduto ?? false,
    temLogotipo: opcoes.temLogotipo ?? false,
  };
}

function inferirTipoPeca(peca: PecaPlanejada): TipoPeca {
  const texto = `${peca.titulo} ${peca.objetivo} ${peca.conteudo}`.toLowerCase();
  if (/lan[çc]amento|novidade|novo /.test(texto)) return "lancamento";
  if (/promo|desconto|oferta|combo|r\$/.test(texto)) return "promocao";
  if (/natal|p[áa]scoa|dia d[aeo]|feriado|anivers/.test(texto)) return "data-comemorativa";
  return "anuncio-produto";
}

// ---------------------------------------------------------------------------
// Transcrição de áudio
// ---------------------------------------------------------------------------
// O operador manda um áudio em vez de digitar o pedido. Custo irrisório perto
// de uma geração de imagem, e economiza o passo mais chato da operação.
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
