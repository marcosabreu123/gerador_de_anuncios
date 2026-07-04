// Tipos do domínio — espelham o schema do Supabase (ver supabase/schema.sql).

export type Plano = "free" | "pro";

export interface UserRow {
  id: string;
  nome: string | null;
  email: string;
  plano: Plano;
  creditos_disponiveis: number;
  is_admin: boolean;
  created_at: string;
}

export type ProjectStatus = "rascunho" | "gerando" | "concluido";

export interface ProjectRow {
  id: string;
  user_id: string;
  nome_projeto: string | null;
  tipo_arte: string | null;
  formato: Formato | null;
  status: ProjectStatus;
  created_at: string;
}

export type ImageStatus = "gerada" | "ajustada" | "erro";

export interface ImageRow {
  id: string;
  project_id: string;
  user_id: string;
  imagem_original_url: string | null;
  imagem_gerada_url: string | null;
  prompt_usado: string | null;
  modelo_usado: string | null;
  status: ImageStatus;
  created_at: string;
}

export type CreditoTipo = "consumo" | "compra" | "bonus";

export interface CreditRow {
  id: string;
  user_id: string;
  tipo: CreditoTipo;
  quantidade: number;
  motivo: string | null;
  created_at: string;
}

// ==== Fluxo guiado ====

// Formatos de saída oferecidos ao lojista.
export type Formato = "story-9-16" | "feed-4-5" | "quadrado-1-1";

export const FORMATOS: Record<
  Formato,
  { label: string; aspecto: string; ratio: string; descricao: string }
> = {
  "story-9-16": { label: "Story", aspecto: "9:16", ratio: "aspect-[9/16]", descricao: "Instagram/WhatsApp Stories" },
  "feed-4-5": { label: "Feed", aspecto: "4:5", ratio: "aspect-[4/5]", descricao: "Publicação no feed" },
  "quadrado-1-1": { label: "Quadrado", aspecto: "1:1", ratio: "aspect-square", descricao: "Post clássico 1:1" },
};

// Chaves antigas (usadas antes da v2.2) — mantidas só para não quebrar a
// exibição de projetos já salvos no banco com o formato antigo.
const FORMATOS_LEGADO: Record<string, Formato> = {
  story: "story-9-16",
  feed: "feed-4-5",
  quadrado: "quadrado-1-1",
};

// Resolve tanto a chave nova ("story-9-16") quanto a antiga ("story") pro
// registro de FORMATOS — usado ao exibir projetos antigos.
export function resolverFormato(valor: string | null | undefined): Formato | undefined {
  if (!valor) return undefined;
  if (valor in FORMATOS) return valor as Formato;
  return FORMATOS_LEGADO[valor];
}

// Estilos visuais pré-definidos. "estilo-livre" é um valor sentinela: indica
// que o lojista descreveu o estilo com as próprias palavras em vez de
// escolher um preset — nesse caso o texto real fica em `estiloLivre`.
export type EstiloVisual = "premium-bege" | "minimalista" | "luxo-escuro" | "clean-branco" | "vibrante" | "estilo-livre";

export const ESTILOS: Record<Exclude<EstiloVisual, "estilo-livre">, { label: string; descricao: string; hint: string }> = {
  "premium-bege": {
    label: "Premium bege",
    descricao: "Sofisticado, tons bege/dourado",
    hint: "fundo bege sofisticado, iluminação quente realista, clima de luxo discreto",
  },
  minimalista: {
    label: "Minimalista",
    descricao: "Limpo, muito espaço em branco",
    hint: "composição minimalista, muito espaço negativo, foco total no produto",
  },
  "luxo-escuro": {
    label: "Luxo escuro",
    descricao: "Fundo escuro, contraste dramático",
    hint: "fundo escuro elegante, iluminação dramática, reflexos sutis, clima premium noturno",
  },
  "clean-branco": {
    label: "Clean branco",
    descricao: "Fundo branco, e-commerce",
    hint: "fundo branco clean estilo e-commerce, iluminação suave e uniforme",
  },
  vibrante: {
    label: "Vibrante",
    descricao: "Cores fortes, chamativo",
    hint: "cores vibrantes e chamativas, alto contraste, energia comercial",
  },
};

// Nível visual da peça — controla o quão "chamativo" vs. "sofisticado" é o
// resultado, mas NUNCA autoriza estética de panfleto amador em nenhum dos
// três (ver regras de direção de arte em prompt-builder.ts). Padrão é
// "profissional-equilibrado", nunca "popular-chamativo".
export type NivelVisual = "popular-chamativo" | "profissional-equilibrado" | "premium-sofisticado";

export const NIVEIS_VISUAIS: Record<NivelVisual, { label: string; descricao: string; hint: string }> = {
  "popular-chamativo": {
    label: "Popular chamativo",
    descricao: "Oferta direta, bem vibrante",
    hint: "mais vibrante e direto, forte apelo de oferta, mas com tipografia limpa e composição organizada — nunca amador ou com estética de panfleto de supermercado",
  },
  "profissional-equilibrado": {
    label: "Profissional equilibrado",
    descricao: "Comercial, elegante e acessível",
    hint: "equilíbrio entre apelo comercial e sofisticação, cores comerciais porém elegantes, hierarquia clara, visual confiável de anúncio premium acessível",
  },
  "premium-sofisticado": {
    label: "Premium sofisticado",
    descricao: "Editorial, upscale, clean",
    hint: "visual editorial e upscale, bastante espaço negativo, paleta sofisticada, tipografia refinada, tom aspiracional",
  },
};

// Tipo de peça publicitária.
export type TipoPeca =
  | "anuncio-produto"
  | "anuncio-servico"
  | "promocao"
  | "lancamento"
  | "data-comemorativa"
  | "prova-social"
  | "catalogo";

export const TIPOS_PECA: Record<TipoPeca, { label: string }> = {
  "anuncio-produto": { label: "Anúncio de produto" },
  "anuncio-servico": { label: "Anúncio de serviço" },
  promocao: { label: "Promoção" },
  lancamento: { label: "Lançamento" },
  "data-comemorativa": { label: "Data comemorativa" },
  "prova-social": { label: "Prova social" },
  catalogo: { label: "Catálogo" },
};

// Onde a arte vai ser usada.
export type Objetivo = "instagram" | "whatsapp" | "trafego-pago" | "catalogo" | "loja-fisica" | "outro";

export const OBJETIVOS: Record<Objetivo, { label: string }> = {
  instagram: { label: "Instagram" },
  whatsapp: { label: "WhatsApp" },
  "trafego-pago": { label: "Tráfego pago" },
  catalogo: { label: "Catálogo" },
  "loja-fisica": { label: "Loja física" },
  outro: { label: "Outro" },
};

// De onde vem o conteúdo do anúncio: o próprio lojista especifica, ou a IA
// propõe e o lojista aprova.
export type ModoConteudo = "usuario-especificou" | "ia-sugere-conteudo";

// Elemento textual/informativo do anúncio que não cabe nos campos fixos
// (rede social, código promocional, selo de garantia...). Estrutura livre
// porque varia muito por segmento e tipo de peça.
export interface ElementoExtra {
  tipo: string;
  valor: string;
  origem: "usuario" | "ia-sugerido";
}

// Pergunta específica de nicho que o agente decidiu fazer dinamicamente
// (ver "inteligência de segmento" em agente-conversa.ts). Estrutura livre
// porque as perguntas mudam por segmento — não há lista fixa no código.
export interface PerguntaSegmento {
  pergunta: string;
  resposta: string;
}

// Conteúdo do anúncio já ORGANIZADO em hierarquia de marketing — é isso que
// o prompt-builder usa para estruturar o texto na arte (headline em
// destaque, informações secundárias agrupadas, assinatura discreta etc).
// Monta-se a partir da resposta aberta "o que você quer que apareça
// escrito?" — nunca é só uma frase solta.
export interface ConteudoAnuncio {
  headline?: string;
  oferta?: string;
  beneficio?: string;
  cta?: string;
  contato?: string;
  endereco?: string;
  informacoesSecundarias?: string[];
  assinaturaMarca?: string;
}

// Tipos de imagem que o lojista pode anexar durante a conversa. Cada tipo
// aceita mais de um arquivo (ex.: produto em vários ângulos).
export type TipoImagemAnexo = "produto" | "referencia" | "logotipo";

export const TIPOS_IMAGEM_ANEXO: Record<
  TipoImagemAnexo,
  { label: string; botao: string; ajuda: string }
> = {
  produto: {
    label: "foto do produto",
    botao: "📷 Enviar foto do produto",
    ajuda: "Uma ou mais fotos reais do produto (ângulos diferentes ajudam).",
  },
  referencia: {
    label: "imagem de referência",
    botao: "🖼️ Enviar referência de anúncio",
    ajuda: "Um anúncio ou arte que você goste, como inspiração de estilo.",
  },
  logotipo: {
    label: "logotipo",
    botao: "🏷️ Enviar logotipo",
    ajuda: "Sua marca/logo, se quiser que apareça na arte.",
  },
};

export interface ImagemAnexo {
  tipo: TipoImagemAnexo;
  url: string;
}

// Briefing completo e resolvido — exigido para poder gerar a imagem.
// `conteudoAnuncio` precisa estar aprovado (ver regra de negócio no agente:
// nunca inserir texto que o lojista não pediu sem antes confirmar).
// `estiloVisual` é híbrido: um preset, OU "estilo-livre" com o texto real em
// `estiloLivre`.
export interface BriefingCompleto {
  tipoPeca: TipoPeca;
  nomeProduto: string;
  descricaoProduto?: string;
  detalhesVisuaisProduto?: string;
  formato: Formato;
  objetivo?: Objetivo;
  estiloVisual?: EstiloVisual;
  estiloLivre?: string;
  nivelVisual?: NivelVisual;
  publicoTom?: string;
  temFotoProduto: boolean;
  temReferencia?: boolean;
  temLogotipo?: boolean;
  modoConteudo?: ModoConteudo;
  conceito?: string;
  conteudoAnuncio?: ConteudoAnuncio;
  preco?: string;
  promocao?: string;
  beneficioPrincipal?: string;
  chamadaWhatsapp?: string;
  endereco?: string;
  horario?: string;
  entrega?: string;
  elementosExtras?: ElementoExtra[];
  perguntasSegmento?: PerguntaSegmento[];
}

// Estado em andamento durante a conversa — nada é obrigatório até o agente
// sinalizar `prontoParaGerar: true`.
export type BriefingParcial = Partial<BriefingCompleto>;

// ==== Agente conversacional ====

export interface MensagemChat {
  role: "user" | "assistant";
  content: string;
}

// Sinal de alto nível sobre o que o front deve fazer nesse turno — usado
// junto com campoEmColeta/opcoes/prontoParaGerar, não no lugar deles.
export type AcaoSugerida =
  | "continuar_conversa"
  | "pedir_upload"
  | "confirmar_briefing"
  | "liberar_geracao"
  | "ajuste_pontual"
  | "nova_criacao";

// Contrato de resposta do agente a cada turno (ver system prompt em
// src/lib/ai/agente-conversa.ts). `opcoes` vazio = pergunta de texto livre.
export interface ContratoAgente {
  mensagem: string;
  opcoes: string[];
  campoEmColeta: string | null;
  briefingParcial: BriefingParcial;
  prontoParaGerar: boolean;
  acaoSugerida: AcaoSugerida;
}
