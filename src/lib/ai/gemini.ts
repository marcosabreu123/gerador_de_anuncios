import { GoogleGenAI } from "@google/genai";
import { GEMINI_FLASH_IMAGE } from "./models";

// Imagem gerada retornada pelo Gemini (bytes inline em base64).
export interface ImagemGerada {
  base64: string;
  mimeType: string;
}

export interface EntradaProduto {
  base64: string; // foto original do produto
  mimeType: string;
}

export interface OpcoesGeracao {
  prompt: string;
  produto?: EntradaProduto; // foto do produto (edição/composição). Opcional.
  modelo?: string; // default: flash
  variacoes?: number; // quantas artes gerar (default 2)
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY não configurada. Adicione ao .env.local para gerar imagens.",
    );
  }
  return new GoogleGenAI({ apiKey });
}

// Extrai a primeira imagem inline da resposta do Gemini.
function extrairImagem(resp: unknown): ImagemGerada | null {
  const r = resp as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
  const parts = r?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part?.inlineData?.data;
    if (data) {
      return { base64: data, mimeType: part.inlineData?.mimeType ?? "image/png" };
    }
  }
  return null;
}

async function gerarUma(
  ai: GoogleGenAI,
  modelo: string,
  prompt: string,
  produto?: EntradaProduto,
): Promise<ImagemGerada | null> {
  // partes do conteúdo: texto sempre; foto do produto quando houver.
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (produto) {
    parts.push({ inlineData: { mimeType: produto.mimeType, data: produto.base64 } });
  }

  const resp = await ai.models.generateContent({
    model: modelo,
    contents: [{ role: "user", parts }],
  });

  return extrairImagem(resp);
}

// Gera N variações em paralelo. Falhas individuais não derrubam o lote.
export async function gerarVariacoes(opts: OpcoesGeracao): Promise<ImagemGerada[]> {
  const ai = getClient();
  const modelo = opts.modelo ?? GEMINI_FLASH_IMAGE;
  const n = Math.max(1, Math.min(opts.variacoes ?? 2, 4));

  const resultados = await Promise.allSettled(
    Array.from({ length: n }, () => gerarUma(ai, modelo, opts.prompt, opts.produto)),
  );

  const imagens: ImagemGerada[] = [];
  for (const r of resultados) {
    if (r.status === "fulfilled" && r.value) imagens.push(r.value);
  }

  if (imagens.length === 0) {
    throw new Error("O Gemini não retornou nenhuma imagem. Verifique o modelo e a API key.");
  }
  return imagens;
}
