// Tipos do domínio — espelham o schema do Supabase (ver supabase/schema.sql).

export type Plano = "free" | "pro";

export interface UserRow {
  id: string;
  nome: string | null;
  email: string;
  plano: Plano;
  creditos_disponiveis: number;
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
export type Formato = "story" | "feed" | "quadrado";

export const FORMATOS: Record<
  Formato,
  { label: string; aspecto: string; ratio: string; descricao: string }
> = {
  story: { label: "Story", aspecto: "9:16", ratio: "aspect-[9/16]", descricao: "Instagram/WhatsApp Stories" },
  feed: { label: "Feed", aspecto: "4:5", ratio: "aspect-[4/5]", descricao: "Publicação no feed" },
  quadrado: { label: "Quadrado", aspecto: "1:1", ratio: "aspect-square", descricao: "Post clássico 1:1" },
};

// Estilos visuais pré-definidos (viram parte do briefing enviado à IA).
export type Estilo = "premium-bege" | "minimalista" | "luxo-escuro" | "clean-branco" | "vibrante";

export const ESTILOS: Record<Estilo, { label: string; descricao: string; hint: string }> = {
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

// Informações do produto coletadas no formulário guiado.
export interface BriefingProduto {
  nomeProduto: string;
  preco?: string;
  frase?: string;
  beneficio?: string;
  chamadaWhatsapp?: string;
  objetivo?: string;
}

// Payload completo do fluxo guiado enviado ao backend.
export interface BriefingCompleto extends BriefingProduto {
  formato: Formato;
  estilo: Estilo;
}
