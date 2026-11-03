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

export type QualidadeImagem = "low" | "medium" | "high";

// Qualidade da imagem final.
//
// Era "low" fixo, por medo de estourar o antigo teto de 60s da function. Com
// 120s o medo não se sustenta: medido no comparativo de modelos, "low" levou
// 11s e "medium" 31s, ambos bem dentro do teto.
//
// O padrão subiu para "medium" porque "low" erra tipografia fina. No mesmo
// briefing e com o mesmo prompt, "low" imprimiu o preço com vírgula dupla
// ("R$ 39,,90") enquanto "medium" saiu limpo — e preço errado é o defeito mais
// caro possível numa peça de anúncio.
//
// Custo por imagem: low US$ 0,02, medium US$ 0,07, high US$ 0,19. Num pacote
// de 10 imagens a US$ 0,07, a API custa cerca de R$ 3,90 contra R$ 34,90 de
// receita. Para voltar ao anterior, IMAGE_QUALITY=low.
export type Etapa = "rascunho" | "final";

export function qualidadeParaEtapa(_etapa: Etapa): QualidadeImagem {
  const bruto = (process.env.IMAGE_QUALITY ?? "").trim();
  return bruto === "low" || bruto === "medium" || bruto === "high" ? bruto : "medium";
}

// Tamanho (WIDTHxHEIGHT) por formato — gpt-image-2 aceita resoluções
// customizadas, múltiplas de 16, com razão de aspecto entre 1:3 e 3:1.
export const TAMANHO_POR_FORMATO: Record<Formato, string> = {
  "story-9-16": "1088x1920",
  "feed-4-5": "1024x1280",
  "quadrado-1-1": "1024x1024",
};
