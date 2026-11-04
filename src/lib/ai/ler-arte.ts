import OpenAI from "openai";
import sharp from "sharp";
import { criarCompletionComRetry } from "./completions";
import { TEXT_PROMPT_BUILDER_MODEL } from "./models";
import type { EntradaImagem, TipoEntradaImagem } from "./openai-image";

// Leitura de uma arte pronta, para o modo "Criar nova versão".
//
// A arte antiga NÃO vai para o gerador de imagem. Testado em produção: com ela
// anexada, mesmo com o prompt proibindo usar a composição, a peça voltava com o
// mesmo grid, e o modelo ainda inventava telefone e endereço para cumprir a
// frase "preserve phone number, address". Aqui um modelo de visão transcreve o
// que a arte diz, e o diretor de arte cria a peça do zero com essas informações.
// Produto e logo seguem como recorte, sem carregar o layout junto.

export interface Recorte {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface LeituraDaArte {
  textos: string[];
  produto: string;
  cores: string[];
  layout: string;
  ladoDoProduto: "esquerda" | "direita" | "centro";
  recorteProduto: Recorte | null;
  recorteLogo: Recorte | null;
}

const SYSTEM_LEITURA = `Você recebe uma arte publicitária pronta e transcreve o que há nela. Não opine e não melhore nada.

Responda SOMENTE com um objeto JSON:
{
  "textos": ["cada bloco de texto da arte, copiado caractere por caractere, sem corrigir nada"],
  "produto": "o que está sendo anunciado, descrito para um fotógrafo refazer: forma, cor, material e rótulo",
  "cores": ["#RRGGBB"],
  "layout": "em uma frase, como a arte está organizada: onde ficam o título, o preço, o produto e a logo",
  "ladoDoProduto": "esquerda, direita ou centro: de que lado da arte está a maior massa do produto",
  "recorteProduto": { "x": 0.1, "y": 0.2, "largura": 0.5, "altura": 0.6 },
  "recorteLogo": { "x": 0.8, "y": 0.05, "largura": 0.15, "altura": 0.1 }
}

"textos" deixa de fora o que faz parte do desenho da logo e o que está impresso no rótulo do produto. Um preço é um bloco só, com a moeda junto do valor: "R$ 29,90", mesmo que a arte desenhe o "R$" menor ou separado.
"cores" traz de duas a quatro cores que definem a arte.
Os recortes usam frações da imagem, de 0 a 1, com x e y no canto superior esquerdo. "recorteProduto" cobre o item principal do anúncio e não pode ter nenhum texto da arte dentro: num combo, recorte só o item central. "recorteLogo" cobre só a logo. Se a arte não tiver produto ou logo, ou se não der para recortar sem pegar texto, use null.`;

function normalizarRecorte(bruto: unknown): Recorte | null {
  if (!bruto || typeof bruto !== "object") return null;
  const { x, y, largura, altura } = bruto as Record<string, unknown>;
  const valores = [x, y, largura, altura];
  if (!valores.every((v) => typeof v === "number" && v >= 0 && v <= 1)) return null;
  return { x: x as number, y: y as number, largura: largura as number, altura: altura as number };
}

export async function lerArte(
  arte: EntradaImagem,
): Promise<{ leitura: LeituraDaArte; uso: { modelo: string; entrada: number; saida: number } }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente.");

  // maxRetries 0 pelo mesmo motivo da ficha: criarCompletionComRetry já repete.
  const openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 });
  const completion = await criarCompletionComRetry(openai, {
    model: TEXT_PROMPT_BUILDER_MODEL,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_LEITURA },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:${arte.mimeType};base64,${arte.base64}`, detail: "high" },
          },
        ],
      },
    ],
  });

  const o = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
  const lista = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

  const textos = lista(o.textos);
  // Arte sem texto legível não tem campanha para recriar: repetir com a fila é
  // melhor do que entregar uma peça sem as informações do cliente.
  if (textos.length === 0) throw new Error("Não consegui ler os textos da arte enviada.");

  return {
    leitura: {
      textos,
      produto: typeof o.produto === "string" ? o.produto.trim() : "",
      cores: lista(o.cores).filter((c) => /^#[0-9a-fA-F]{6}$/.test(c)),
      layout: typeof o.layout === "string" ? o.layout.trim() : "",
      ladoDoProduto: o.ladoDoProduto === "esquerda" || o.ladoDoProduto === "direita" ? o.ladoDoProduto : "centro",
      recorteProduto: normalizarRecorte(o.recorteProduto),
      recorteLogo: normalizarRecorte(o.recorteLogo),
    },
    uso: {
      modelo: TEXT_PROMPT_BUILDER_MODEL,
      entrada: completion.usage?.prompt_tokens ?? 0,
      saida: completion.usage?.completion_tokens ?? 0,
    },
  };
}

// Folga em volta do recorte: a caixa que o modelo devolve é aproximada, e cortar
// a ponta do produto é pior do que levar um pouco de fundo junto.
const MARGEM = 0.02;
const LADO_MINIMO_PX = 48;

export async function recortarDaArte(
  arte: EntradaImagem,
  recorte: Recorte,
  tipo: TipoEntradaImagem,
): Promise<EntradaImagem | null> {
  const imagem = Buffer.from(arte.base64, "base64");
  const { width, height } = await sharp(imagem).metadata();
  if (!width || !height) return null;

  const esquerda = Math.max(0, recorte.x - MARGEM);
  const topo = Math.max(0, recorte.y - MARGEM);
  const direita = Math.min(1, recorte.x + recorte.largura + MARGEM);
  const base = Math.min(1, recorte.y + recorte.altura + MARGEM);

  const area = {
    left: Math.round(esquerda * width),
    top: Math.round(topo * height),
    width: Math.round((direita - esquerda) * width),
    height: Math.round((base - topo) * height),
  };
  if (area.width < LADO_MINIMO_PX || area.height < LADO_MINIMO_PX) return null;

  const pedaco = await sharp(imagem).extract(area).png().toBuffer();
  return { base64: pedaco.toString("base64"), mimeType: "image/png", tipo };
}
