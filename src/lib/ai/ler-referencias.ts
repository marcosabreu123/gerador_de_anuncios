import OpenAI from "openai";
import sharp from "sharp";
import { RecusaModeloError } from "./completions";
import { TEXT_PROMPT_BUILDER_MODEL } from "./models";

// Leitura das artes de referência de um cliente, para a IA conhecer a marca antes
// de sugerir qualquer coisa.
//
// As imagens são lidas uma vez e o entendimento fica guardado no brand kit. O
// operador costuma clicar em "Melhorar" várias vezes seguidas, e mandar as imagens
// em toda chamada custaria mais e demoraria mais para dar o mesmo resultado.
//
// A leitura descreve a linguagem da marca, e não o inventário de cada arte. Quando
// o cadastro listava faixa, balão e relógio, as peças voltavam com a mesma faixa, o
// mesmo balão e o mesmo relógio: referência é norte, e a ideia de cada peça é da IA.

export interface LeituraDasReferencias {
  negocio: string;
  mensagens: string;
  voz: string;
  visual: string;
  // Títulos e frases que já saíram, para a sugestão não repetir.
  jaUsadas: string[];
  // Quais referências foram lidas. Quando muda, a leitura ficou velha.
  assinatura: string;
}

const SYSTEM_LEITURA_REFERENCIAS = `Você é diretor de criação e recebe as artes que uma marca já publicou, para conhecer essa marca antes de criar peças novas para ela. Olhe o conjunto, não cada arte. As artes são um norte: ensinam como a marca é, e quem vai criar depois precisa continuar livre para ter ideias novas.

Responda SOMENTE com um objeto JSON válido:
{
  "negocio": "em até duas frases, o que a empresa faz, com quem ela fala e como essa pessoa compra ou usa, pelo que as artes mostram",
  "mensagens": "em uma ou duas frases, os assuntos e ganchos que a marca costuma trabalhar, em linhas gerais",
  "voz": "em uma ou duas frases, como a marca fala: ritmo, humor, formalidade e tipo de palavra",
  "visual": "em até três frases, a linguagem visual do conjunto: cores que dominam, tipo de letra, foto ou ilustração, energia, quantidade de informação e quanto as peças variam entre si",
  "jaUsadas": ["títulos e frases de destaque das artes, copiados como estão, no máximo doze"]
}

Em "mensagens", "voz" e "visual", descreva o jeito da marca, nunca o inventário das artes. Não cite frase, e não liste objeto, faixa, selo, balão, personagem nem posição de elemento. Quem ler precisa sentir o espírito da marca sem conseguir copiar nenhuma peça.

Só afirme o que as artes mostram. Se não der para saber algo, deixe de fora. Preço, data, telefone e condição comercial valem só para aquela arte antiga: não entram em "negocio", "mensagens", "voz" nem "visual".`;

// Texto de arte continua legível neste tamanho, e cada imagem custa bem menos do
// que no tamanho original.
const LADO_MAXIMO_PX = 1024;

// Referência que não abre não pode derrubar a leitura das outras.
async function imagemParaLeitura(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
      .rotate()
      .resize({ width: LADO_MAXIMO_PX, height: LADO_MAXIMO_PX, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  } catch (e) {
    console.error("[ler-referencias] falha ao abrir referência:", url, e);
    return null;
  }
}

export async function lerReferencias(
  urls: string[],
  assinatura: string,
  empresa: string,
): Promise<{ leitura: LeituraDasReferencias; uso: { modelo: string; entrada: number; saida: number } }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente.");

  const imagens = (await Promise.all(urls.map(imagemParaLeitura))).filter((i): i is string => Boolean(i));
  if (imagens.length === 0) throw new Error("Nenhuma referência abriu.");

  // Uma tentativa só, sem criarCompletionComRetry: a leitura roda antes da sugestão,
  // dentro do mesmo limite de tempo da rota, e quem chama segue sem ela se falhar.
  const openai = new OpenAI({ apiKey, timeout: 40_000, maxRetries: 0 });
  const completion = await openai.chat.completions.create({
    model: TEXT_PROMPT_BUILDER_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_LEITURA_REFERENCIAS },
      {
        role: "user",
        content: [
          { type: "text", text: empresa },
          ...imagens.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
        ],
      },
    ],
  });
  if (completion.choices[0]?.message?.refusal) throw new RecusaModeloError();

  const o = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
  const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  const leitura: LeituraDasReferencias = {
    negocio: texto(o.negocio),
    mensagens: texto(o.mensagens),
    voz: texto(o.voz),
    visual: texto(o.visual),
    jaUsadas: Array.isArray(o.jaUsadas)
      ? o.jaUsadas.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 12)
      : [],
    assinatura,
  };
  if (!leitura.visual) throw new Error("A leitura das referências veio vazia.");

  return {
    leitura,
    uso: {
      modelo: TEXT_PROMPT_BUILDER_MODEL,
      entrada: completion.usage?.prompt_tokens ?? 0,
      saida: completion.usage?.completion_tokens ?? 0,
    },
  };
}

// O que o redator recebe. As frases já usadas vão à parte, porque têm outra regra.
export function leituraParaBriefing(leitura: LeituraDasReferencias): string {
  return [
    leitura.negocio && `O negócio: ${leitura.negocio}`,
    leitura.mensagens && `O que a marca costuma dizer: ${leitura.mensagens}`,
    leitura.voz && `Como a marca fala: ${leitura.voz}`,
    leitura.visual && `Como a marca aparece: ${leitura.visual}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// O que o diretor de arte recebe: ele decide o visual, e a voz da marca já chega
// nos textos do pedido.
export function leituraParaDiretor(leitura: LeituraDasReferencias): string {
  return [
    leitura.negocio && `O negócio: ${leitura.negocio}`,
    leitura.visual && `Como a marca aparece: ${leitura.visual}`,
  ]
    .filter(Boolean)
    .join("\n");
}
