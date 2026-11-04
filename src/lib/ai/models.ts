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
// CRIAÇÃO usa "medium", e isso inclui melhorar ou recriar uma arte-base: nos dois
// casos o modelo desenha layout e tipografia do zero. A vírgula dupla no preço
// não depende da qualidade, ela apareceu em "low" e em "medium"; quem a evita é
// a regra de preço em formatos-modelo.ts.
//
// EDIÇÃO é só o ajuste cirúrgico, e fica em "low". Aqui o modelo não inventa
// tipografia, ele copia a que já está na imagem. Num teste de sete modelos
// trocando o preço da mesma arte (uma amostra de cada), gpt-image-2 em "low" foi
// o que menos mexeu no resto: erro médio de 8,3 contra 11,2 do segundo colocado.
//
// Custo real por peça fica em `geracoes`, calculado pelos tokens (ver custo.ts).
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
