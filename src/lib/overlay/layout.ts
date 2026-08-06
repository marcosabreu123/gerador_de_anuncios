import { carregarFonte, larguraDoTexto, type PesoFonte } from "./fontes";
import type { ConteudoAnuncio, Formato } from "@/lib/types";

// Motor de layout do overlay: decide posição, corpo e quebra de linha de
// cada bloco de texto da peça. Não desenha nada — só produz a descrição do
// que desenhar (ver render.ts). Separado assim porque é a parte com regra de
// negócio visual e vale a pena poder raciocinar/testar sobre ela sozinha.
//
// Todas as medidas são proporcionais à LARGURA da arte, então o mesmo layout
// funciona em story (1088x1920), feed (1024x1280) e quadrado (1024x1024) sem
// tabela de exceção por formato.

export interface Dimensoes {
  largura: number;
  altura: number;
}

export const DIMENSOES_POR_FORMATO: Record<Formato, Dimensoes> = {
  "story-9-16": { largura: 1088, altura: 1920 },
  "feed-4-5": { largura: 1024, altura: 1280 },
  "quadrado-1-1": { largura: 1024, altura: 1024 },
};

export interface LinhaTexto {
  texto: string;
  x: number;
  y: number; // baseline
  tamanho: number;
  peso: PesoFonte;
  cor: string;
}

export interface SeloPreco {
  x: number;
  y: number;
  largura: number;
  altura: number;
  raio: number;
  cor: string;
  texto: LinhaTexto;
}

export interface LayoutOverlay {
  dimensoes: Dimensoes;
  // Faixa de escurecimento atrás do texto — garante legibilidade sobre
  // qualquer arte, que é justamente o que não dá pra garantir quando o
  // modelo de imagem desenha o texto por conta própria.
  scrimTopo: number;
  linhas: LinhaTexto[];
  selo?: SeloPreco;
}

// Proporções (fração da largura). Ajustadas pra hierarquia publicitária
// clássica: headline domina, oferta em selo, resto discreto.
const P = {
  margem: 0.068,
  headline: 0.082,
  headlineMin: 0.048,
  beneficio: 0.036,
  preco: 0.062,
  precoMin: 0.034,
  cta: 0.038,
  contato: 0.03,
  assinatura: 0.028,
  paddingSeloX: 0.032,
  paddingSeloY: 0.022,
  espacoEntreBlocos: 0.032,
  respiroInferior: 0.055,
};

const ENTRELINHA_HEADLINE = 1.14;
const ENTRELINHA_CORPO = 1.34;
const MAX_LINHAS_HEADLINE = 3;

const COR_TEXTO = "#FFFFFF";
const COR_TEXTO_SECUNDARIO = "#E8E8E8";
const COR_SELO = "#FFFFFF";
const COR_TEXTO_SELO = "#111111";

// Altura do ascender no corpo pedido — usada pra converter "topo do bloco"
// em baseline (que é o que o opentype.js espera).
function ascender(peso: PesoFonte, tamanho: number): number {
  const fonte = carregarFonte(peso);
  return (fonte.ascender / fonte.unitsPerEm) * tamanho;
}

// Quebra gulosa por palavra. Palavra que sozinha estoura a largura é mantida
// na própria linha (não cortamos palavra ao meio — quebra de palavra é um
// dos erros visuais que o projeto inteiro tenta evitar, ver prompt-builder).
export function quebrarLinhas(texto: string, peso: PesoFonte, tamanho: number, larguraMax: number): string[] {
  const palavras = texto.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];

  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const candidata = atual ? `${atual} ${palavra}` : palavra;
    if (atual && larguraDoTexto(candidata, peso, tamanho) > larguraMax) {
      linhas.push(atual);
      atual = palavra;
    } else {
      atual = candidata;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

// Reduz o corpo até a headline caber no número máximo de linhas. Evita o
// caso clássico de headline longa virar 6 linhas minúsculas ou vazar a peça.
function ajustarHeadline(
  texto: string,
  larguraMax: number,
  tamanhoInicial: number,
  tamanhoMinimo: number,
): { linhas: string[]; tamanho: number } {
  let tamanho = tamanhoInicial;
  let linhas = quebrarLinhas(texto, "bold", tamanho, larguraMax);
  while (linhas.length > MAX_LINHAS_HEADLINE && tamanho > tamanhoMinimo) {
    tamanho = Math.max(tamanhoMinimo, tamanho * 0.94);
    linhas = quebrarLinhas(texto, "bold", tamanho, larguraMax);
  }
  return { linhas, tamanho };
}

interface BlocoPendente {
  linhas: string[];
  tamanho: number;
  peso: PesoFonte;
  cor: string;
  entrelinha: number;
  selo?: boolean;
}

function alturaDoBloco(b: BlocoPendente): number {
  return b.linhas.length * b.tamanho * b.entrelinha;
}

// Junta contato e endereço numa linha só quando couber — dois blocos
// pequenos separados poluem mais do que informam.
function montarLinhaContato(c: ConteudoAnuncio): string | null {
  const partes = [c.contato?.trim(), c.endereco?.trim()].filter(Boolean) as string[];
  if (partes.length === 0) return null;
  return partes.join("  ·  ");
}

// Monta o layout completo. Recebe o conteúdo JÁ organizado em hierarquia
// (conteudoAnuncio, montado pelo agente conversacional) — o overlay não
// decide o que dizer, só como isso é desenhado.
export function montarLayout(
  conteudo: ConteudoAnuncio,
  formato: Formato,
  dimensoesReais?: Dimensoes,
): LayoutOverlay {
  const dimensoes = dimensoesReais ?? DIMENSOES_POR_FORMATO[formato];
  const { largura, altura } = dimensoes;
  const margem = largura * P.margem;
  const larguraUtil = largura - margem * 2;
  const espaco = largura * P.espacoEntreBlocos;

  const blocos: BlocoPendente[] = [];

  const headlineTexto = conteudo.headline?.trim();
  if (headlineTexto) {
    const { linhas, tamanho } = ajustarHeadline(
      headlineTexto.toUpperCase(),
      larguraUtil,
      largura * P.headline,
      largura * P.headlineMin,
    );
    blocos.push({ linhas, tamanho, peso: "bold", cor: COR_TEXTO, entrelinha: ENTRELINHA_HEADLINE });
  }

  const beneficio = conteudo.beneficio?.trim();
  if (beneficio) {
    const tamanho = largura * P.beneficio;
    blocos.push({
      linhas: quebrarLinhas(beneficio, "regular", tamanho, larguraUtil),
      tamanho,
      peso: "regular",
      cor: COR_TEXTO_SECUNDARIO,
      entrelinha: ENTRELINHA_CORPO,
    });
  }

  const oferta = conteudo.oferta?.trim();
  if (oferta) {
    // O selo é uma linha só (quebrar preço em duas linhas dentro da caixa
    // fica ruim), então reduz o corpo até a caixa caber na largura útil.
    const padX = largura * P.paddingSeloX;
    const minimo = largura * P.precoMin;
    let tamanho = largura * P.preco;
    while (tamanho > minimo && larguraDoTexto(oferta, "bold", tamanho) + padX * 2 > larguraUtil) {
      tamanho *= 0.95;
    }

    if (larguraDoTexto(oferta, "bold", tamanho) + padX * 2 <= larguraUtil) {
      blocos.push({ linhas: [oferta], tamanho, peso: "bold", cor: COR_TEXTO_SELO, entrelinha: 1, selo: true });
    } else {
      // Nem no corpo mínimo cabe numa linha (oferta escrita como frase
      // inteira, não como preço). Encolher mais deixaria o preço ilegível e
      // manter o selo faria o texto vazar a arte — então vira bloco de texto
      // normal, com quebra de linha, preservando a informação inteira.
      const tamanhoTexto = largura * P.preco * 0.8;
      blocos.push({
        linhas: quebrarLinhas(oferta, "bold", tamanhoTexto, larguraUtil),
        tamanho: tamanhoTexto,
        peso: "bold",
        cor: COR_TEXTO,
        entrelinha: ENTRELINHA_HEADLINE,
      });
    }
  }

  const cta = conteudo.cta?.trim();
  if (cta) {
    const tamanho = largura * P.cta;
    blocos.push({
      linhas: quebrarLinhas(cta, "semibold", tamanho, larguraUtil),
      tamanho,
      peso: "semibold",
      cor: COR_TEXTO,
      entrelinha: ENTRELINHA_CORPO,
    });
  }

  // Informações secundárias (horário, entrega, formas de pagamento...) — no
  // modo "ia" elas iam pro prompt e o modelo desenhava; aqui precisam ser
  // desenhadas explicitamente, senão sumiriam da arte sem aviso nenhum.
  const secundarias = (conteudo.informacoesSecundarias ?? []).map((s) => s.trim()).filter(Boolean);
  if (secundarias.length > 0) {
    const tamanho = largura * P.contato;
    blocos.push({
      linhas: quebrarLinhas(secundarias.join("  ·  "), "regular", tamanho, larguraUtil),
      tamanho,
      peso: "regular",
      cor: COR_TEXTO_SECUNDARIO,
      entrelinha: ENTRELINHA_CORPO,
    });
  }

  const contato = montarLinhaContato(conteudo);
  if (contato) {
    const tamanho = largura * P.contato;
    blocos.push({
      linhas: quebrarLinhas(contato, "regular", tamanho, larguraUtil),
      tamanho,
      peso: "regular",
      cor: COR_TEXTO_SECUNDARIO,
      entrelinha: ENTRELINHA_CORPO,
    });
  }

  const assinatura = conteudo.assinaturaMarca?.trim();
  if (assinatura) {
    const tamanho = largura * P.assinatura;
    blocos.push({
      linhas: [assinatura.toUpperCase()],
      tamanho,
      peso: "semibold",
      cor: COR_TEXTO_SECUNDARIO,
      entrelinha: ENTRELINHA_CORPO,
    });
  }

  // Selo tem altura própria (o retângulo, não só o texto).
  const alturaSelo = (b: BlocoPendente) => b.tamanho + largura * P.paddingSeloY * 2;
  const alturaTotal =
    blocos.reduce((soma, b) => soma + (b.selo ? alturaSelo(b) : alturaDoBloco(b)), 0) +
    espaco * Math.max(0, blocos.length - 1);

  // Pilha ancorada na base, com respiro inferior — produto ocupa a parte de
  // cima da peça (é o que o prompt de imagem reserva, ver prompt-builder).
  let y = altura - largura * P.respiroInferior - alturaTotal;
  const scrimTopo = Math.max(0, y - espaco * 2);

  const linhas: LinhaTexto[] = [];
  let selo: SeloPreco | undefined;

  for (const bloco of blocos) {
    if (bloco.selo) {
      const texto = bloco.linhas[0];
      const padX = largura * P.paddingSeloX;
      const padY = largura * P.paddingSeloY;
      const larguraTexto = larguraDoTexto(texto, bloco.peso, bloco.tamanho);
      const alturaCaixa = bloco.tamanho + padY * 2;
      selo = {
        x: margem,
        y,
        largura: larguraTexto + padX * 2,
        altura: alturaCaixa,
        raio: alturaCaixa * 0.22,
        cor: COR_SELO,
        texto: {
          texto,
          x: margem + padX,
          y: y + padY + ascender(bloco.peso, bloco.tamanho),
          tamanho: bloco.tamanho,
          peso: bloco.peso,
          cor: bloco.cor,
        },
      };
      y += alturaCaixa + espaco;
      continue;
    }

    for (const [i, texto] of bloco.linhas.entries()) {
      linhas.push({
        texto,
        x: margem,
        y: y + i * bloco.tamanho * bloco.entrelinha + ascender(bloco.peso, bloco.tamanho),
        tamanho: bloco.tamanho,
        peso: bloco.peso,
        cor: bloco.cor,
      });
    }
    y += alturaDoBloco(bloco) + espaco;
  }

  return { dimensoes, scrimTopo, linhas, selo };
}
