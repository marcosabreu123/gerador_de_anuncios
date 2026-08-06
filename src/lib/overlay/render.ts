import sharp from "sharp";
import { textoParaPath } from "./fontes";
import { montarLayout, type LayoutOverlay } from "./layout";
import type { ConteudoAnuncio, Formato } from "@/lib/types";

// Composição final do overlay: pega a arte gerada pelo modelo de imagem (que
// vem SEM texto nenhum, ver prompt-builder) e desenha a tipografia real por
// cima, com sharp.
//
// Detalhe que vale registrar: o SVG montado aqui não contém um único
// elemento <text> — todo texto já chega como <path> (ver fontes.ts). Além de
// eliminar a dependência de fonte no servidor, isso significa que o texto do
// lojista nunca é interpolado como XML: um preço com "&" ou uma headline com
// aspas não têm como quebrar o documento nem exigir escaping.

const ID_GRADIENTE = "scrimOverlay";

function construirSvg(layout: LayoutOverlay): string {
  const { largura, altura } = layout.dimensoes;
  const partes: string[] = [];

  partes.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}">`,
  );

  // Escurecimento progressivo atrás do texto — é o que garante contraste
  // sobre qualquer arte, clara ou escura. Sem isso o texto ficaria refém da
  // sorte do fundo que o modelo gerou.
  partes.push(
    `<defs><linearGradient id="${ID_GRADIENTE}" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#000000" stop-opacity="0"/>` +
      `<stop offset="0.42" stop-color="#000000" stop-opacity="0.70"/>` +
      `<stop offset="1" stop-color="#000000" stop-opacity="0.92"/>` +
      `</linearGradient></defs>`,
  );
  partes.push(
    `<rect x="0" y="${layout.scrimTopo.toFixed(2)}" width="${largura}" height="${(altura - layout.scrimTopo).toFixed(2)}" fill="url(#${ID_GRADIENTE})"/>`,
  );

  if (layout.selo) {
    const s = layout.selo;
    partes.push(
      `<rect x="${s.x.toFixed(2)}" y="${s.y.toFixed(2)}" width="${s.largura.toFixed(2)}" height="${s.altura.toFixed(2)}" rx="${s.raio.toFixed(2)}" ry="${s.raio.toFixed(2)}" fill="${s.cor}"/>`,
    );
    const d = textoParaPath(s.texto.texto, s.texto.x, s.texto.y, s.texto.peso, s.texto.tamanho);
    partes.push(`<path d="${d}" fill="${s.texto.cor}"/>`);
  }

  for (const linha of layout.linhas) {
    const d = textoParaPath(linha.texto, linha.x, linha.y, linha.peso, linha.tamanho);
    partes.push(`<path d="${d}" fill="${linha.cor}"/>`);
  }

  partes.push("</svg>");
  return partes.join("");
}

// Desenha o texto sobre a arte e devolve o PNG final em base64 — mesmo
// formato que gerarVariacoes já devolve, pra que o resto do pipeline
// (upload no Storage, registro em images, download) siga sem mudança.
export async function aplicarOverlay(
  imagemBase64: string,
  conteudo: ConteudoAnuncio,
  formato: Formato,
): Promise<string> {
  const base = sharp(Buffer.from(imagemBase64, "base64"));
  const meta = await base.metadata();

  // O layout é montado sobre as dimensões REAIS da imagem, não sobre as
  // esperadas do formato: se o modelo devolver um tamanho levemente
  // diferente, o texto continua alinhado em vez de sair deslocado.
  const dimensoesReais =
    meta.width && meta.height ? { largura: meta.width, altura: meta.height } : undefined;

  const layout = montarLayout(conteudo, formato, dimensoesReais);
  if (layout.linhas.length === 0 && !layout.selo) return imagemBase64;

  const svg = construirSvg(layout);
  const composta = await base
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();

  return composta.toString("base64");
}
