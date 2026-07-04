import { GoogleGenAI } from "@google/genai";
import { GEMINI_FLASH_IMAGE } from "./models";

// Imagem gerada retornada pelo Gemini (bytes inline em base64). Carrega o
// prompt que a originou — necessário porque cada variação agora pode ter
// uma direção criativa própria (ver PromptsGerados em prompt-builder.ts).
export interface ImagemGerada {
  base64: string;
  mimeType: string;
  promptUsado: string;
}

// Tipo de imagem de entrada — usado para rotular cada imagem no prompt
// multimodal, já que a API não tem um campo estruturado de "papel" por
// imagem (só uma sequência de partes texto/imagem).
export type TipoEntradaImagem = "produto" | "referencia" | "logotipo" | "base";

export interface EntradaImagem {
  base64: string;
  mimeType: string;
  tipo: TipoEntradaImagem;
}

const LABELS_ENTRADA: Record<TipoEntradaImagem, string> = {
  produto:
    "Foto real do produto (herói da composição — preserve formato, cor e rótulo reais):",
  referencia:
    "Imagem de referência de estilo (inspire-se na composição/paleta/clima, mas NÃO copie texto, marca ou logotipo de terceiros que apareçam nela):",
  logotipo:
    "Logotipo da marca do lojista (inclua de forma discreta e legível na arte, sem distorcer):",
  base: "Imagem base a ser editada (aplique o ajuste pedido preservando o restante):",
};

export interface OpcoesGeracao {
  // Um prompt POR variação desejada — cada uma pode (e deve, quando vier do
  // prompt-builder) ter uma direção criativa própria, não o mesmo texto
  // repetido. length define quantas artes são geradas.
  prompts: string[];
  imagens?: EntradaImagem[]; // 0+ imagens de entrada (produto/referência/logo/base). Opcional.
  modelo?: string; // default: flash
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
function extrairImagem(resp: unknown, prompt: string): ImagemGerada | null {
  const r = resp as {
    candidates?: Array<{
      content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
  const parts = r?.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    const data = part?.inlineData?.data;
    if (data) {
      return { base64: data, mimeType: part.inlineData?.mimeType ?? "image/png", promptUsado: prompt };
    }
  }
  return null;
}

async function gerarUma(
  ai: GoogleGenAI,
  modelo: string,
  prompt: string,
  imagens: EntradaImagem[],
): Promise<ImagemGerada | null> {
  // partes do conteúdo: texto sempre; cada imagem de entrada rotulada com uma
  // linha de texto antes dela, pra o modelo entender o papel de cada uma.
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  for (const img of imagens) {
    parts.push({ text: LABELS_ENTRADA[img.tipo] });
    parts.push({ inlineData: { mimeType: img.mimeType, data: img.base64 } });
  }

  const resp = await ai.models.generateContent({
    model: modelo,
    contents: [{ role: "user", parts }],
  });

  return extrairImagem(resp, prompt);
}

// Gera uma imagem por prompt em paralelo (cada uma com sua própria direção
// criativa). Falhas individuais não derrubam o lote.
export async function gerarVariacoes(opts: OpcoesGeracao): Promise<ImagemGerada[]> {
  const ai = getClient();
  const modelo = opts.modelo ?? GEMINI_FLASH_IMAGE;
  const prompts = opts.prompts.slice(0, 4);
  const imagens = opts.imagens ?? [];

  const resultados = await Promise.allSettled(
    prompts.map((prompt) => gerarUma(ai, modelo, prompt, imagens)),
  );

  const geradas: ImagemGerada[] = [];
  for (const r of resultados) {
    if (r.status === "fulfilled" && r.value) geradas.push(r.value);
  }

  if (geradas.length === 0) {
    throw new Error("O Gemini não retornou nenhuma imagem. Verifique o modelo e a API key.");
  }
  return geradas;
}
