import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions";
import {
  CAMPOS_DE_LISTA,
  CAMPOS_FICHA,
  ROTULO_MATERIAL,
  alteracoesValidas,
  regrasEmLista,
  tipoMaterialValido,
  type AnexoCadastro,
  type CampoFicha,
  type FichaCadastro,
  type MaterialClassificado,
  type MensagemCadastro,
} from "@/lib/agencia/cadastro-ia";
import { criarCompletionComRetry } from "./completions";
import type { Recorte } from "./ler-arte";
import { TEXT_PROMPT_BUILDER_MODEL } from "./models";

// Cadastro de cliente conversando. O sócio conta da empresa e manda imagens; a IA
// preenche a ficha e pergunta o que falta. Nada é gravado aqui: a ficha volta para
// a tela, o sócio confere e só o botão de cadastrar grava.
//
// As regras de cada campo são as que o cadastro feito à mão aprendeu: texto curto,
// identidade como norte, regra só quando o dono disse, contato copiado como veio.

const SYSTEM_CADASTRO = `Você trabalha numa agência que cria artes de Instagram para pequenas empresas e ajuda o sócio a cadastrar uma empresa cliente, conversando. Ele conta o que sabe, por texto ou áudio, e manda imagens: logo, fotos, artes que a empresa já postou, prints do Instagram. Você preenche a ficha e pergunta o que faltar. Nada é gravado até ele clicar em cadastrar, então nunca diga que salvou ou cadastrou.

A ficha alimenta a IA que cria as artes. Cores e regras ela cumpre à risca. Tipografia, tom e estilo são norte: ela usa para acertar o jeito da marca e cria uma ideia nova em cada arte. Por isso escreva pouco, e cada campo segue a sua regra:

- "nome": o nome da empresa, como ela se apresenta.
- "nicho": o ramo em poucas palavras e em minúsculas, como "autoescola", "hamburgueria artesanal" ou "clínica odontológica".
- "sobre": até três frases curtas dizendo o que a empresa faz, para quem e como a pessoa compra ou contrata (loja, delivery, WhatsApp, app). Sem slogan, preço, promoção, data, telefone ou endereço.
- "contato_nome" e "contato_telefone": a pessoa da empresa com quem a agência fala, como o dono ou o gerente. Não é o contato que vai nas artes.
- "cores_primarias": as uma ou duas cores que mais identificam a marca, normalmente as da logo. "cores_secundarias": até três cores de apoio. Escreva o nome comum da cor e o hex, como "azul-marinho #1B2A4A e amarelo #F5C400". Tire o hex das cores medidas em cada imagem. Numa foto, a medida inclui céu, parede e rua: use a cor da logo, da placa ou da arte, nunca a do ambiente. Cor que veio só da conversa leva um hex aproximado. Branco e preto só entram quando são parte clara da identidade.
- "tipografia": o ESTILO de letra, nunca o nome de uma fonte. Escreva uma faixa que deixe cada arte escolher a própria fonte, variando de uma arte para outra dentro da identidade da marca e do segmento: o caráter dos títulos, o do texto de apoio e o que não combina com a marca. Se o sócio ou uma imagem trouxer o nome de uma fonte, escreva o estilo dela no lugar do nome (Bebas Neue vira sans-serif condensada em caixa alta; Montserrat vira sans-serif geométrica). Exemplos de forma, e não de conteúdo, porque cada marca tem a sua faixa: "títulos em sans-serif pesada ou condensada, de impacto; textos em sans-serif limpa; nada de letra cursiva fina" ou "títulos em serif elegante ou script firme; textos em sans-serif leve e espaçada".
- "tom_de_voz": uma frase curta sobre como a marca fala, como "próximo e direto, com humor leve". Sem bordão e sem frase de exemplo.
- "estilo_visual": uma frase curta sobre o jeito visual: energia, foto ou ilustração, quantidade de informação. Não liste objeto, faixa, selo, personagem nem posição de elemento que aparece nas artes, porque a IA das artes passa a copiar.
- "regras_obrigatorias" e "regras_proibidas": listas com SÓ o que o sócio disser como regra. Nunca invente regra a partir das imagens ou do segmento. Uma regra por item, curta, começando por verbo, como "Sempre mostrar o WhatsApp no rodapé". Obrigatória é o que toda arte precisa ter; proibida é o que nunca pode aparecer.
- "whatsapp", "endereco", "horario_funcionamento" e "instagram": os dados que vão nas artes. Copie como o sócio disse ou como aparece numa imagem, telefone com DDD e Instagram com @. Dois telefones vão juntos, separados por " / ". Dado que aparece numa imagem já entra na ficha, e você pede para o sócio confirmar. Nunca invente nem complete um número. Se a conversa e uma imagem trouxerem versões diferentes do mesmo dado, fique com a do sócio e pergunte qual é a certa.

Em tudo que você escreve na ficha, não use estas palavras, nem como proibição: hoje, grátis, desconto, brinde, garantia, parcela, parcelamento, última, limitado, melhor, mais barato, menor preço, por menos. O app confere se as artes prometem o que a loja não disse, e palavra que está no cadastro passa sem aviso. Se o sócio ditar uma regra com uma delas, escreva o mesmo sentido sem a palavra (por exemplo, "nunca colocar desconto" vira "Nunca anunciar condição comercial que o pedido não trouxer") e conte isso na resposta.

MATERIAIS. Cada imagem tem um id. Classifique cada imagem nova com um "tipo":
- "logo": a logo da própria empresa, de preferência o arquivo limpo. Marque só uma.
- "produto": foto real do que a empresa vende.
- "arte_aprovada": arte que a empresa já postou e que representa a marca.
- "referencia_visual": inspiração de estilo, como arte de outra marca que o sócio quer como norte.
- "logo_parceiro": logo de um programa, parceiro ou marca de terceiro que só entra na arte quando o pedido citar o nome, como a do CNH do Brasil.
- "descartar": imagem que não serve de material: print de conversa, foto de fachada usada só para tirar dados, imagem repetida ou ruim.
Em "descricao", escreva uma frase curta do que a imagem é, como "logo em losango azul e amarelo" ou "hambúrguer duplo com cheddar". Na logo de parceiro, escreva só o nome que aciona a logo, como ele seria escrito num pedido, por exemplo "CNH do Brasil".
Se nenhuma imagem for a logo da empresa em arquivo próprio e a logo aparecer inteira, nítida e de frente numa imagem nova (placa, fachada, arte ou print), devolva "recorteLogo" nessa imagem: a caixa justa da logo em frações da imagem, com "x" e "y" do canto de cima à esquerda, "largura" e "altura", tudo de 0 a 1. O app recorta e mostra para o sócio conferir. Só recorte imagem que veio nesta mensagem.

CONVERSA. Fale como colega de agência, em português do Brasil, curto e sem formalidade. Em "resposta", diga em uma ou duas frases o que você preencheu ou mudou. Se trocou o que o sócio disse, como a fonte que virou estilo ou a regra reescrita sem palavra de promessa, conte em poucas palavras. Depois faça no máximo três perguntas, sobre o que mais faz falta, nesta ordem: nome e ramo; o que a empresa vende e como a pessoa compra; logo; artes que ela já postou; WhatsApp e Instagram; endereço e horário, quando o ramo atende no local; regras da marca. Não pergunte o que já está na ficha nem o que o sócio disse que não sabe. Não pergunte preço, promoção nem plano: o plano ele escolhe na hora de cadastrar. Quando ele pedir para mudar um campo, mude. Campo que o sócio editou à mão só muda se ele pedir.

Responda SOMENTE com um objeto JSON válido:
{
  "resposta": "o que você diz ao sócio",
  "alteracoes": { "campo": "valor novo" },
  "materiais": [{ "id": "i1", "tipo": "logo", "descricao": "...", "recorteLogo": null }],
  "faltando": ["até quatro itens do que ainda falta, do mais importante para o menos, em palavras do dia a dia como \"Instagram\" ou \"horário\", nunca o nome do campo"]
}

"alteracoes" leva só os campos que mudaram nesta mensagem, com o valor novo inteiro. As regras vão como lista com todas as regras daquele campo. Para apagar um campo, mande "" ou lista vazia. "materiais" leva um item para cada imagem nova, e uma imagem antiga só quando o sócio pedir para mudar o tipo dela.`;

export interface ImagemNova {
  id: string;
  dataUrl: string;
  paleta: string[];
}

export interface EntradaCadastro {
  ficha: FichaCadastro;
  editados: CampoFicha[];
  // Materiais que a IA já viu, com o que ela disse deles e as cores medidas.
  vistos: AnexoCadastro[];
  novas: ImagemNova[];
  historico: MensagemCadastro[];
  mensagem: string;
}

export interface SaidaCadastro {
  resposta: string;
  alteracoes: Partial<FichaCadastro>;
  materiais: (MaterialClassificado & { recorteLogo: Recorte | null })[];
  faltando: string[];
  uso: { modelo: string; entrada: number; saida: number };
}

// ---------------------------------------------------------------------------
// Imagens
// ---------------------------------------------------------------------------

const LADO_LEITURA_PX = 1024;

interface Grupo {
  r: number;
  g: number;
  b: number;
  n: number;
}

function hex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

// As cores que dominam a imagem, com a área de cada uma. O modelo erra hex de olho;
// medido, o cadastro sai com a cor da logo. Pixel transparente não conta, então a
// logo sem fundo mede só o desenho.
async function medirPaleta(imagem: Buffer): Promise<string[]> {
  const { default: sharp } = await import("sharp");
  const { data } = await sharp(imagem)
    .rotate()
    .resize({ width: 96, height: 96, fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Primeiro em baldes de 16 tons por canal, depois junta baldes de cor parecida: o
  // degradê e a borda serrilhada da letra não viram dez cores.
  const baldes = new Map<number, Grupo>();
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const chave = ((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4);
    const balde = baldes.get(chave) ?? { r: 0, g: 0, b: 0, n: 0 };
    balde.r += data[i];
    balde.g += data[i + 1];
    balde.b += data[i + 2];
    balde.n += 1;
    baldes.set(chave, balde);
    total += 1;
  }
  if (total === 0) return [];

  const grupos: Grupo[] = [];
  for (const balde of [...baldes.values()].sort((a, b) => b.n - a.n)) {
    const cor = { r: balde.r / balde.n, g: balde.g / balde.n, b: balde.b / balde.n };
    const perto = grupos.find((g) => Math.hypot(g.r - cor.r, g.g - cor.g, g.b - cor.b) < 48);
    if (perto) {
      const n = perto.n + balde.n;
      perto.r = (perto.r * perto.n + cor.r * balde.n) / n;
      perto.g = (perto.g * perto.n + cor.g * balde.n) / n;
      perto.b = (perto.b * perto.n + cor.b * balde.n) / n;
      perto.n = n;
    } else {
      grupos.push({ ...cor, n: balde.n });
    }
  }

  return grupos
    .sort((a, b) => b.n - a.n)
    .filter((g) => g.n / total >= 0.03)
    .slice(0, 6)
    .map((g) => `${hex(g)} ${Math.round((g.n / total) * 100)}%`);
}

// Baixa a imagem nova uma vez: dela saem a versão que o modelo lê, as cores medidas e,
// se a logo estiver nela, o recorte.
export async function prepararImagem(
  url: string,
): Promise<{ dataUrl: string; paleta: string[]; original: Buffer } | null> {
  try {
    const { default: sharp } = await import("sharp");
    const res = await fetch(url);
    if (!res.ok) return null;
    const original = Buffer.from(await res.arrayBuffer());
    const [jpeg, paleta] = await Promise.all([
      sharp(original)
        .rotate()
        .resize({ width: LADO_LEITURA_PX, height: LADO_LEITURA_PX, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: 82 })
        .toBuffer(),
      medirPaleta(original).catch(() => []),
    ]);
    return { dataUrl: `data:image/jpeg;base64,${jpeg.toString("base64")}`, paleta, original };
  } catch (e) {
    console.error("[cadastro-ia] falha ao abrir imagem:", url, e);
    return null;
  }
}

// Recorta a logo de uma foto ou arte, com uma folga para não cortar a borda dela.
export async function recortarLogo(
  original: Buffer,
  caixa: Recorte,
): Promise<{ png: Buffer; paleta: string[] } | null> {
  try {
    const { default: sharp } = await import("sharp");
    // Mesma orientação da imagem que o modelo viu.
    const girada = await sharp(original).rotate().toBuffer();
    const { width, height } = await sharp(girada).metadata();
    if (!width || !height) return null;

    const folga = 0.02;
    const esquerda = Math.max(0, Math.floor((caixa.x - folga) * width));
    const topo = Math.max(0, Math.floor((caixa.y - folga) * height));
    const direita = Math.min(width, Math.ceil((caixa.x + caixa.largura + folga) * width));
    const baixo = Math.min(height, Math.ceil((caixa.y + caixa.altura + folga) * height));
    if (direita - esquerda < 24 || baixo - topo < 24) return null;

    const png = await sharp(girada)
      .extract({ left: esquerda, top: topo, width: direita - esquerda, height: baixo - topo })
      .resize({ width: LADO_LEITURA_PX, height: LADO_LEITURA_PX, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return { png, paleta: await medirPaleta(png).catch(() => []) };
  } catch (e) {
    console.error("[cadastro-ia] falha ao recortar a logo:", e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------

function fichaParaModelo(ficha: FichaCadastro): Record<string, string | string[]> {
  return Object.fromEntries(
    CAMPOS_FICHA.map((c) => [c, CAMPOS_DE_LISTA.includes(c) ? regrasEmLista(ficha[c]) : ficha[c]]),
  );
}

function descreverVisto(a: AnexoCadastro): string {
  const tipo = a.tipo ? ROTULO_MATERIAL[a.tipo].toLowerCase() : "sem tipo";
  return [
    `- ${a.id}: ${tipo}${a.editado ? " (o sócio escolheu)" : ""}`,
    a.descricao && `"${a.descricao}"`,
    a.recorte && "recortada pelo app de outra imagem",
    a.paleta.length > 0 && `cores medidas: ${a.paleta.join(", ")}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function caixaValida(valor: unknown): Recorte | null {
  if (!valor || typeof valor !== "object") return null;
  const o = valor as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
  const x = n(o.x);
  const y = n(o.y);
  const largura = n(o.largura);
  const altura = n(o.altura);
  if ([x, y, largura, altura].some(Number.isNaN)) return null;
  if (x < 0 || y < 0 || largura < 0.03 || altura < 0.03) return null;
  if (x + largura > 1.02 || y + altura > 1.02) return null;
  return { x, y, largura: Math.min(largura, 1 - x), altura: Math.min(altura, 1 - y) };
}

function listaDeTextos(valor: unknown, maximo: number, limite: number): string[] {
  return Array.isArray(valor)
    ? valor
        .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
        .map((x) => x.trim().slice(0, limite))
        .slice(0, maximo)
    : [];
}

// Lança quando não consegue: a rota devolve o erro e a tela mantém o que o sócio mandou.
export async function conversarCadastro(entrada: EntradaCadastro): Promise<SaidaCadastro> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente.");

  const conversa = entrada.historico
    .filter((m) => m.texto.trim() || m.anexos.length > 0)
    .map((m) => {
      const imagens = m.anexos.length > 0 ? ` [imagens ${m.anexos.join(", ")}]` : "";
      return `${m.papel === "operador" ? "Sócio" : "Você"}: ${m.texto.trim()}${imagens}`;
    })
    .join("\n");

  const texto = [
    `FICHA ATUAL:\n${JSON.stringify(fichaParaModelo(entrada.ficha), null, 1)}`,
    `CAMPOS QUE O SÓCIO EDITOU À MÃO: ${entrada.editados.length > 0 ? entrada.editados.join(", ") : "nenhum"}`,
    entrada.vistos.length > 0
      ? `IMAGENS QUE VOCÊ JÁ VIU (não vêm de novo):\n${entrada.vistos.map(descreverVisto).join("\n")}`
      : null,
    conversa ? `CONVERSA ATÉ AQUI:\n${conversa}` : null,
    `MENSAGEM NOVA DO SÓCIO: ${entrada.mensagem.trim() || "(sem texto, só imagens)"}`,
    entrada.novas.length > 0
      ? `IMAGENS NOVAS: ${entrada.novas.length}, logo abaixo, cada uma depois do seu id.`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const partes: ChatCompletionContentPart[] = [{ type: "text", text: texto }];
  for (const imagem of entrada.novas) {
    partes.push({
      type: "text",
      text: `Imagem ${imagem.id}${imagem.paleta.length > 0 ? `. Cores medidas: ${imagem.paleta.join(", ")}` : ""}`,
    });
    partes.push({ type: "image_url", image_url: { url: imagem.dataUrl, detail: "high" } });
  }

  // maxRetries 0 porque criarCompletionComRetry já tenta de novo.
  const openai = new OpenAI({ apiKey, timeout: 50_000, maxRetries: 0 });
  const completion = await criarCompletionComRetry(openai, {
    model: TEXT_PROMPT_BUILDER_MODEL,
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_CADASTRO },
      { role: "user", content: partes },
    ],
  });

  const conteudo = completion.choices[0]?.message?.content;
  if (!conteudo) throw new Error("A IA não respondeu.");
  const o = JSON.parse(conteudo) as Record<string, unknown>;

  const idsNovos = new Set(entrada.novas.map((i) => i.id));
  const idsConhecidos = new Set([...idsNovos, ...entrada.vistos.map((a) => a.id)]);
  const materiais = (Array.isArray(o.materiais) ? o.materiais : []).flatMap((bruto) => {
    if (!bruto || typeof bruto !== "object") return [];
    const m = bruto as Record<string, unknown>;
    const id = typeof m.id === "string" ? m.id.trim() : "";
    const tipo = tipoMaterialValido(m.tipo);
    if (!idsConhecidos.has(id) || !tipo) return [];
    return [
      {
        id,
        tipo,
        descricao: typeof m.descricao === "string" ? m.descricao.trim().slice(0, 120) : "",
        // Recorte só de imagem que o modelo viu agora, e nunca da própria logo.
        recorteLogo: idsNovos.has(id) && tipo !== "logo" ? caixaValida(m.recorteLogo) : null,
      },
    ];
  });

  return {
    resposta:
      typeof o.resposta === "string" && o.resposta.trim()
        ? o.resposta.trim().slice(0, 2000)
        : "Atualizei a ficha ao lado. Confira e me diga o que mudar.",
    alteracoes: alteracoesValidas(o.alteracoes),
    materiais,
    faltando: listaDeTextos(o.faltando, 4, 80),
    uso: {
      modelo: TEXT_PROMPT_BUILDER_MODEL,
      entrada: completion.usage?.prompt_tokens ?? 0,
      saida: completion.usage?.completion_tokens ?? 0,
    },
  };
}
