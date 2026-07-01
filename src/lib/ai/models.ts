// IDs de modelos centralizados — fácil trocar conforme custo/qualidade.

// Gemini (imagem). Nano Banana Pro = mais forte em texto legível dentro da arte
// (preço, chamada); Nano Banana 2 = mais rápido/barato, bom para rascunhos.
export const GEMINI_PRO_IMAGE = "gemini-3-pro-image"; // Nano Banana Pro
export const GEMINI_FLASH_IMAGE = "gemini-3.1-flash-image"; // Nano Banana 2

// OpenAI (conversa / montagem de prompt).
export const OPENAI_CHAT_MODEL = "gpt-4.1-mini";

// Qual modelo usar em cada etapa do fluxo.
// - rascunho (primeiras variações): flash, mais barato.
// - final / ajuste com texto crítico: pro, melhor legibilidade.
export type Etapa = "rascunho" | "final";

export function modeloParaEtapa(etapa: Etapa): string {
  return etapa === "final" ? GEMINI_PRO_IMAGE : GEMINI_FLASH_IMAGE;
}
