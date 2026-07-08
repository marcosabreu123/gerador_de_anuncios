import OpenAI, { toFile } from "openai";
import { IMAGE_MODEL } from "./models";

// Imagem gerada pela OpenAI (bytes inline em base64). Carrega o prompt que a
// originou — cada variação pode ter uma direção criativa própria (ver
// PromptsGerados em prompt-builder.ts).
export interface ImagemGerada {
  base64: string;
  mimeType: string;
  promptUsado: string;
}

// Tipo de imagem de entrada — usado para descrever o papel de cada uma pro
// modelo, já que a API de imagem da OpenAI não tem um campo estruturado de
// "papel" por imagem (só uma lista ordenada de arquivos).
export type TipoEntradaImagem = "produto" | "referencia" | "logotipo" | "base" | "fundo" | "elemento_extra";

export interface EntradaImagem {
  base64: string;
  mimeType: string;
  tipo: TipoEntradaImagem;
}

const LABELS_ENTRADA: Record<TipoEntradaImagem, string> = {
  produto: "a foto real do produto anexada pelo lojista — use como base fiel, preservando formato, cor e rótulo reais",
  referencia:
    "uma imagem de referência de estilo anexada — use só como inspiração de composição/paleta/clima, nunca copie texto, marca ou logotipo de terceiros que apareçam nela",
  logotipo: "o logotipo da marca do lojista anexado — inclua de forma discreta e legível na arte, sem distorcer",
  base: "a imagem base a ser editada — aplique o ajuste pedido preservando o restante exatamente como está",
  fundo:
    "uma imagem de referência de fundo anexada pelo lojista — use como base/inspiração para o novo fundo da arte, sem copiar textos ou marcas de terceiros que apareçam nela",
  elemento_extra:
    "um elemento visual adicional anexado pelo lojista (ex: selo, ícone, bandeira, embalagem) — inclua-o na arte de forma pequena, proporcional e integrada, sem competir com produto, preço ou headline",
};

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada. Adicione ao .env.local para gerar imagens.");
  }
  return new OpenAI({ apiKey, timeout: 180_000 });
}

function extensaoDoMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

// A API de imagem da OpenAI não tem parte estruturada de texto por imagem
// como o Gemini tinha — descrevemos cada anexo em uma frase antes do prompt.
function construirPromptComImagens(prompt: string, imagens: EntradaImagem[]): string {
  if (imagens.length === 0) return prompt;
  const descricoes = imagens.map((img, i) => `Imagem anexada ${i + 1} é ${LABELS_ENTRADA[img.tipo]}.`);
  return `${descricoes.join(" ")}\n\n${prompt}`;
}

async function gerarUma(
  client: OpenAI,
  modelo: string,
  prompt: string,
  imagens: EntradaImagem[],
  tamanho: string,
  qualidade: "low" | "medium" | "high",
): Promise<ImagemGerada | null> {
  const promptFinal = construirPromptComImagens(prompt, imagens);

  const resp =
    imagens.length === 0
      ? await client.images.generate({
          model: modelo,
          prompt: promptFinal,
          size: tamanho,
          quality: qualidade,
          background: "opaque",
        })
      : await client.images.edit({
          model: modelo,
          prompt: promptFinal,
          image: await Promise.all(
            imagens.map((img, i) =>
              toFile(Buffer.from(img.base64, "base64"), `${img.tipo}-${i}.${extensaoDoMime(img.mimeType)}`, {
                type: img.mimeType,
              }),
            ),
          ),
          size: tamanho,
          quality: qualidade,
          background: "opaque",
        });

  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) return null;
  return { base64: b64, mimeType: "image/png", promptUsado: prompt };
}

export interface OpcoesGeracao {
  // Um prompt POR variação desejada — cada uma pode (e deve, quando vem do
  // prompt-builder) ter uma direção criativa própria. length define quantas
  // artes são geradas.
  prompts: string[];
  imagens?: EntradaImagem[]; // 0+ imagens de entrada (produto/referência/logo/base). Opcional.
  modelo?: string; // default: IMAGE_MODEL
  tamanho?: string; // "1024x1024" etc. default "auto" (preserva/decide automaticamente)
  qualidade?: "low" | "medium" | "high"; // default "high"
}

// Gera uma imagem por prompt em paralelo (cada uma com sua própria direção
// criativa). Falhas individuais não derrubam o lote. Sem imagens de entrada
// usa /images/generations; com 1+ imagens usa /images/edits (compõe as
// imagens anexadas na arte final).
export async function gerarVariacoes(opts: OpcoesGeracao): Promise<ImagemGerada[]> {
  const client = getClient();
  const modelo = opts.modelo ?? IMAGE_MODEL;
  const tamanho = opts.tamanho ?? "auto";
  const qualidade = opts.qualidade ?? "high";
  const prompts = opts.prompts.slice(0, 4);
  const imagens = opts.imagens ?? [];

  const resultados = await Promise.allSettled(
    prompts.map((prompt) => gerarUma(client, modelo, prompt, imagens, tamanho, qualidade)),
  );

  const geradas: ImagemGerada[] = [];
  for (const r of resultados) {
    if (r.status === "fulfilled" && r.value) geradas.push(r.value);
    else if (r.status === "rejected") console.error("[openai-image] falha ao gerar uma variação:", r.reason);
  }

  if (geradas.length === 0) {
    throw new Error("A OpenAI não retornou nenhuma imagem. Verifique o modelo e a API key.");
  }
  return geradas;
}
