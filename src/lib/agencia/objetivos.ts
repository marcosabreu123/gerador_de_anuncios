import type { TipoPeca } from "@/lib/types";

// O que a arte vai ser. O operador escolhe antes de escrever: o objetivo dá um
// norte ao diretor de arte e abre os campos que precisam sair na arte exatamente
// como foram escritos. Todos os campos são opcionais, e "Livre" é o pedido só em
// texto, como sempre foi.
//
// Sem nada disso, preço, data e horário vinham soltos no meio do texto, e a arte
// ia e voltava em ajuste até sair do jeito certo. Cada volta gasta API.

export const OBJETIVOS = [
  "livre",
  "promocao",
  "produto",
  "lancamento",
  "data",
  "cardapio",
  "comunicado",
  "institucional",
] as const;
export type ObjetivoArte = (typeof OBJETIVOS)[number];

export interface CampoDoObjetivo {
  id: string;
  rotulo: string;
  exemplo: string;
  multilinha?: boolean;
}

// Um campo preenchido, como vai no briefing da peça. O rótulo diz ao diretor de
// arte o papel do texto; só o valor aparece na arte.
export interface TextoObrigatorio {
  campo: string;
  rotulo: string;
  valor: string;
}

interface DefinicaoObjetivo {
  rotulo: string;
  campos: CampoDoObjetivo[];
  // Para o diretor de arte: o que este tipo de peça precisa resolver.
  orientacao: string;
  // Para o montador antigo, que ainda é a rede quando o diretor falha.
  tipoPeca?: TipoPeca;
}

export const DEFINICAO_OBJETIVO: Record<ObjetivoArte, DefinicaoObjetivo> = {
  livre: { rotulo: "Livre", campos: [], orientacao: "" },
  promocao: {
    rotulo: "Promoção",
    campos: [
      { id: "produto", rotulo: "Produto ou combo", exemplo: "Ex: X-Bacon com fritas e refri" },
      { id: "preco", rotulo: "Preço", exemplo: "Ex: R$ 29,90" },
      { id: "preco_antigo", rotulo: "Preço antigo", exemplo: "Ex: R$ 39,90" },
      { id: "validade", rotulo: "Validade", exemplo: "Ex: só hoje, até as 22h" },
    ],
    orientacao:
      "Promoção. A oferta é a peça: o produto e o preço são os protagonistas, e o preço é o elemento gráfico mais forte depois do produto. Preço antigo, validade e condições entram como apoio, legíveis.",
    tipoPeca: "promocao",
  },
  produto: {
    rotulo: "Produto ou serviço",
    campos: [
      { id: "produto", rotulo: "Produto ou serviço", exemplo: "Ex: Pizza de calabresa" },
      { id: "preco", rotulo: "Preço", exemplo: "Ex: R$ 45,00" },
      { id: "destaque", rotulo: "Destaque", exemplo: "Ex: massa de fermentação natural" },
    ],
    orientacao:
      "Divulgação de produto ou serviço. O produto, ou o resultado do serviço, é o herói da cena, e o texto diz por que vale a pena. Sem inventar oferta.",
    tipoPeca: "anuncio-produto",
  },
  lancamento: {
    rotulo: "Lançamento",
    campos: [
      { id: "produto", rotulo: "O que está chegando", exemplo: "Ex: açaí na tigela" },
      { id: "data", rotulo: "A partir de quando", exemplo: "Ex: sábado, 15/11" },
      { id: "preco", rotulo: "Preço", exemplo: "Ex: a partir de R$ 18,00" },
    ],
    orientacao:
      "Lançamento. A peça tem cara de estreia: o item novo em destaque absoluto e a data, quando houver, bem visível.",
    tipoPeca: "lancamento",
  },
  data: {
    rotulo: "Data comemorativa",
    campos: [
      { id: "data", rotulo: "Data", exemplo: "Ex: Dia das Mães" },
      { id: "mensagem", rotulo: "Mensagem", exemplo: "Ex: Feliz Dia das Mães" },
      { id: "oferta", rotulo: "Oferta", exemplo: "Ex: 10% no Pix até domingo" },
    ],
    orientacao:
      "Data comemorativa. A ocasião guia a peça, com uma situação real daquela data para o público do cliente e a mensagem acima de tudo. Oferta só entra se estiver nos textos obrigatórios ou no pedido.",
    tipoPeca: "data-comemorativa",
  },
  cardapio: {
    rotulo: "Cardápio",
    campos: [
      { id: "titulo", rotulo: "Título", exemplo: "Ex: Cardápio de sexta" },
      {
        id: "itens",
        rotulo: "Itens e preços",
        exemplo: "Um por linha. Ex:\nX-Burger R$ 22,00\nX-Bacon R$ 26,00",
        multilinha: true,
      },
    ],
    orientacao:
      "Cardápio. A peça é uma lista para ler rápido: itens alinhados numa grade limpa, cada preço ao lado do seu item, todos inteiros e legíveis. A comida aparece, mas a lista tem prioridade.",
    tipoPeca: "catalogo",
  },
  comunicado: {
    rotulo: "Comunicado",
    campos: [
      { id: "assunto", rotulo: "Assunto", exemplo: "Ex: Horário de funcionamento no feriado" },
      {
        id: "mensagem",
        rotulo: "Mensagem ou horários",
        exemplo: "Ex:\nSábado: 8h às 12h\nDomingo: fechado",
        multilinha: true,
      },
      { id: "quando", rotulo: "Quando", exemplo: "Ex: 15 de novembro" },
    ],
    orientacao:
      "Comunicado. A peça informa: o assunto em destaque e a mensagem ou os horários em linhas curtas e bem legíveis, no visual da marca. Sem cena de venda e sem oferta.",
  },
  institucional: {
    rotulo: "Institucional",
    campos: [{ id: "mensagem", rotulo: "Mensagem principal", exemplo: "Ex: 20 anos cuidando do seu sorriso" }],
    orientacao:
      "Institucional. A peça fala da marca, e não de um produto: valores, história ou o jeito da empresa, com uma imagem que represente o negócio e uma mensagem curta. Sem preço e sem oferta.",
  },
};

// Um item de cardápio por linha cabe folgado; mais que isso não cabe numa arte.
export const MAX_CARACTERES_CAMPO = 1200;

export function objetivoValido(valor: unknown): ObjetivoArte {
  return typeof valor === "string" && (OBJETIVOS as readonly string[]).includes(valor)
    ? (valor as ObjetivoArte)
    : "livre";
}

// Os campos que vieram da tela, na ordem do objetivo. O rótulo sai daqui, e não
// da tela, para o diretor de arte nunca receber um papel que não existe. Nulo
// quando um texto passa do limite: cortar um texto obrigatório seria mudá-lo.
export function lerTextosObrigatorios(objetivo: ObjetivoArte, bruto: unknown): TextoObrigatorio[] | null {
  const valores =
    bruto && typeof bruto === "object" && !Array.isArray(bruto) ? (bruto as Record<string, unknown>) : {};
  const textos: TextoObrigatorio[] = [];
  for (const campo of DEFINICAO_OBJETIVO[objetivo].campos) {
    const valor = valores[campo.id];
    if (typeof valor !== "string") continue;
    const limpo = valor.replace(/\r\n?/g, "\n").trim();
    if (!limpo) continue;
    if (limpo.length > MAX_CARACTERES_CAMPO) return null;
    textos.push({ campo: campo.id, rotulo: campo.rotulo, valor: limpo });
  }
  return textos;
}

export function orientacaoDoObjetivo(objetivo: ObjetivoArte | undefined): string | undefined {
  if (!objetivo || objetivo === "livre") return undefined;
  return DEFINICAO_OBJETIVO[objetivo]?.orientacao || undefined;
}

// Os textos em lista, um por linha. Valor de várias linhas (o cardápio) vem logo
// abaixo do rótulo, com as linhas como estão.
export function textosObrigatoriosEmTexto(textos: TextoObrigatorio[] | undefined): string | undefined {
  if (!textos?.length) return undefined;
  return textos
    .map((t) => (t.valor.includes("\n") ? `- ${t.rotulo}:\n${t.valor}` : `- ${t.rotulo}: ${t.valor}`))
    .join("\n");
}

// O pedido em texto quando o operador só preencheu os campos. Dá título ao
// pedido e aparece como "Pedido original".
export function pedidoDosCampos(objetivo: ObjetivoArte, textos: TextoObrigatorio[]): string {
  const partes = textos.map((t) => `${t.rotulo}: ${t.valor.replace(/\s*\n\s*/g, "; ").replace(/[.\s]+$/, "")}`);
  return [DEFINICAO_OBJETIVO[objetivo].rotulo, ...partes].join(". ");
}
