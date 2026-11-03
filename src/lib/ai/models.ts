import type { Formato } from "@/lib/types";

// IDs de modelos centralizados — fácil trocar conforme custo/qualidade.

// ---------- Texto ----------

// Prompt-builder: direção de arte, hierarquia visual, copy e estrutura do
// prompt de imagem. Roda uma vez por peça, com o briefing já pronto — por
// isso usa o modelo mais forte sem pesar no custo do lote.
export const TEXT_PROMPT_BUILDER_MODEL = "gpt-5.4";

// Tarefas mecânicas: classificar ajuste pontual vs. nova criação, reescrever
// instrução de edição. Não precisam do modelo mais forte.
export const TEXT_ROUTER_MODEL = "gpt-5.4-nano";

// ---------- Imagem ----------
export const IMAGE_MODEL = "gpt-image-2";

// Qualidade por etapa do fluxo. TODA etapa usa "low": gpt-image-2 é lento
// (40-90s medidos neste projeto, e 79-93s quando a chamada vai com imagem
// anexa, pela rota de edição), e a function tem teto de 120s — acima disso a
// plataforma mata o processo antes do catch rodar, deixando a peça travada em
// "gerando" com o dinheiro da API já gasto.
//
// A diferença de qualidade não justifica o risco: as artes de teste em "low"
// saíram no padrão que o cliente recebe.
export type Etapa = "rascunho" | "final";

export function qualidadeParaEtapa(_etapa: Etapa): "low" {
  return "low";
}

// Tamanho (WIDTHxHEIGHT) por formato — gpt-image-2 aceita resoluções
// customizadas, múltiplas de 16, com razão de aspecto entre 1:3 e 3:1.
export const TAMANHO_POR_FORMATO: Record<Formato, string> = {
  "story-9-16": "1088x1920",
  "feed-4-5": "1024x1280",
  "quadrado-1-1": "1024x1024",
};
