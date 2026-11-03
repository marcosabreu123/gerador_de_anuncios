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

// Criar uma arte e editar uma arte pronta são trabalhos diferentes, e medimos
// que pedem qualidades diferentes.
//
// CRIAÇÃO usa "medium". Em "low" o modelo desenha a tipografia do zero e erra
// o detalhe fino: no mesmo briefing e com o mesmo prompt, "low" imprimiu o
// preço com vírgula dupla ("R$ 39,,90") e "medium" saiu limpo. Preço errado é
// o defeito mais caro que uma peça de anúncio pode ter.
//
// EDIÇÃO fica em "low". Aqui o modelo não inventa tipografia, ele copia a que
// já está na imagem — e num comparativo de sete modelos de edição, trocando o
// preço da mesma arte, gpt-image-2 em "low" foi o que mais preservou o resto
// (erro médio de 8,3 contra 11,2 do segundo colocado) e o único cuja tipografia
// do selo ficou indistinguível da original. Pagar mais não compraria nada.
//
// Custo por imagem: low US$ 0,02, medium US$ 0,07, high US$ 0,19.
// IMAGE_QUALITY e IMAGE_QUALITY_EDICAO sobrescrevem cada um.
export type Etapa = "rascunho" | "final" | "edicao";

function daEnv(nome: string, padrao: QualidadeImagem): QualidadeImagem {
  const bruto = (process.env[nome] ?? "").trim();
  return bruto === "low" || bruto === "medium" || bruto === "high" ? bruto : padrao;
}

export function qualidadeParaEtapa(etapa: Etapa): QualidadeImagem {
  if (etapa === "edicao") return daEnv("IMAGE_QUALITY_EDICAO", "low");
  return daEnv("IMAGE_QUALITY", "medium");
}

// Tamanho (WIDTHxHEIGHT) por formato — gpt-image-2 aceita resoluções
// customizadas, múltiplas de 16, com razão de aspecto entre 1:3 e 3:1.
export const TAMANHO_POR_FORMATO: Record<Formato, string> = {
  "story-9-16": "1088x1920",
  "feed-4-5": "1024x1280",
  "quadrado-1-1": "1024x1024",
};
