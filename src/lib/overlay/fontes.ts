import fs from "node:fs";
import path from "node:path";
// Named imports de propósito: o build ESM do opentype.js 2.x não expõe
// export default (só o CJS expõe), então `import opentype from` quebra o
// build do Turbopack mesmo funcionando em runtime CJS.
import { parse, type Font } from "opentype.js";

// Carrega as fontes usadas no overlay de texto (ver render.ts).
//
// Por que WOFF do @fontsource em vez de fonte instalada no sistema: o texto
// do overlay NUNCA é renderizado como <text> num SVG — ele vira geometria
// (<path>) através do opentype.js. Isso elimina a dependência de fontconfig
// no servidor, que é o ponto onde esse tipo de solução costuma quebrar em
// ambiente serverless (fonte existe na máquina local, não existe no Linux da
// Vercel, e o texto sai com fallback errado ou simplesmente não sai).
// Convertendo pra path, o resultado é idêntico em qualquer ambiente — e é
// tipografia vetorial de verdade, não um bitmap de texto.

export type PesoFonte = "regular" | "semibold" | "bold";

// Subconjunto "latin" do Montserrat — cobre todos os acentos do português
// (á é í ó ú â ê ô ã õ ç) e travessão. Licença SIL OFL (vem do pacote npm,
// não commitamos binário de fonte no repo).
const ARQUIVO_POR_PESO: Record<PesoFonte, string> = {
  regular: "montserrat-latin-400-normal.woff",
  semibold: "montserrat-latin-600-normal.woff",
  bold: "montserrat-latin-700-normal.woff",
};

const DIRETORIO_FONTES = path.join(process.cwd(), "node_modules", "@fontsource", "montserrat", "files");

// As fontes são imutáveis — parsear uma vez por processo evita repetir o
// trabalho a cada bloco de texto (e a cada imagem gerada na mesma instância).
const cache = new Map<PesoFonte, Font>();

export function carregarFonte(peso: PesoFonte): Font {
  const emCache = cache.get(peso);
  if (emCache) return emCache;

  const arquivo = path.join(DIRETORIO_FONTES, ARQUIVO_POR_PESO[peso]);
  let bytes: Buffer;
  try {
    bytes = fs.readFileSync(arquivo);
  } catch {
    // Erro explícito em vez de fallback silencioso: se a fonte não veio no
    // bundle da function, o overlay produziria uma arte sem texto nenhum —
    // muito pior do que falhar e estornar o crédito (ver /api/generate).
    throw new Error(
      `Fonte do overlay não encontrada (${ARQUIVO_POR_PESO[peso]}). Verifique outputFileTracingIncludes em next.config.ts.`,
    );
  }

  // opentype.parse espera ArrayBuffer — Buffer.buffer pode ser um pool
  // compartilhado maior que o arquivo, por isso o slice pelo offset real.
  const fonte = parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  cache.set(peso, fonte);
  return fonte;
}

// Largura que um texto ocupa num dado corpo — base de toda a quebra de linha
// e do auto-ajuste de tamanho (ver layout.ts).
export function larguraDoTexto(texto: string, peso: PesoFonte, tamanho: number): number {
  return carregarFonte(peso).getAdvanceWidth(texto, tamanho);
}

// Converte um texto em path SVG (coordenadas absolutas, baseline em y).
export function textoParaPath(texto: string, x: number, y: number, peso: PesoFonte, tamanho: number): string {
  return carregarFonte(peso).getPath(texto, x, y, tamanho).toPathData(2);
}
