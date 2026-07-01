// Placeholder para edição localizada futura via Flux (fal.ai).
// NÃO IMPLEMENTAR AGORA — apenas a estrutura, para plugar depois.
//
// A ideia: edição com máscara / inpainting sobre uma arte já gerada
// (ex.: trocar só o fundo, corrigir só o texto do preço).
// Quando for implementar, usar a FAL_KEY e o SDK do fal.ai.

import type { ImagemGerada } from "./gemini";

export interface OpcoesEdicaoLocalizada {
  imagemBase: ImagemGerada;
  mascaraBase64?: string; // região a editar
  instrucao: string;
}

export async function editarLocalizado(
  _opts: OpcoesEdicaoLocalizada,
): Promise<ImagemGerada> {
  throw new Error(
    "Edição localizada via Flux ainda não implementada (reservado para fase futura).",
  );
}
