import type { Formato } from "@/lib/types";

// Lê largura/altura direto dos bytes do arquivo (sem depender de nenhuma
// lib de imagem) — suficiente pra decidir qual dos 3 formatos de saída
// (story-9-16/feed-4-5/quadrado-1-1) mais se aproxima da proporção da arte
// original, usado pelos fluxos que operam sobre uma imagem já existente
// (editar detalhe, melhorar arte, criar nova versão) pra nunca mudar o
// formato automaticamente (ver REGRA GLOBAL DE FORMATO).
export interface Dimensoes {
  largura: number;
  altura: number;
}

function lerPng(buf: Buffer): Dimensoes | null {
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(assinatura)) return null;
  return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
}

function lerJpeg(buf: Buffer): Dimensoes | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }
    const marcador = buf[offset + 1];
    // Marcadores SOF (início de frame) que carregam altura/largura — exclui
    // DHT (0xC4), JPG (0xC8) e DAC (0xCC), que não são frames de imagem.
    const ehSOF = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
    const tamanhoSegmento = buf.readUInt16BE(offset + 2);
    if (ehSOF) {
      const altura = buf.readUInt16BE(offset + 5);
      const largura = buf.readUInt16BE(offset + 7);
      return { largura, altura };
    }
    if (marcador === 0xd8 || marcador === 0xd9) {
      offset += 2;
      continue;
    }
    offset += 2 + tamanhoSegmento;
  }
  return null;
}

export function medirDimensoes(buf: Buffer): Dimensoes | null {
  return lerPng(buf) ?? lerJpeg(buf);
}

const PROPORCAO_POR_FORMATO: Record<Formato, number> = {
  "story-9-16": 9 / 16,
  "feed-4-5": 4 / 5,
  "quadrado-1-1": 1,
};

// Decide qual dos 3 formatos de saída suportados mais se aproxima da
// proporção real da imagem — não tenta preservar o pixel exato, só a
// classe de proporção (retrato alto / retrato médio / quadrado), que é o
// que a geração de imagem deste app já suporta como tamanho de saída.
export function formatoMaisProximo(dim: Dimensoes): Formato {
  const proporcao = dim.largura / dim.altura;
  let melhor: Formato = "quadrado-1-1";
  let menorDiferenca = Infinity;
  for (const formato of Object.keys(PROPORCAO_POR_FORMATO) as Formato[]) {
    const diferenca = Math.abs(proporcao - PROPORCAO_POR_FORMATO[formato]);
    if (diferenca < menorDiferenca) {
      menorDiferenca = diferenca;
      melhor = formato;
    }
  }
  return melhor;
}

// Detecta se o pedido do lojista menciona explicitamente um formato
// diferente (ex.: "transforma em feed", "quero em story", "muda para
// quadrado") — nesse caso o formato pedido tem prioridade sobre o da
// imagem original (ver REGRA GLOBAL DE FORMATO: só muda com pedido explícito).
const PADRAO_FORMATO_PEDIDO: { regex: RegExp; formato: Formato }[] = [
  { regex: /\bstory\b|\b9:16\b/i, formato: "story-9-16" },
  { regex: /\bfeed\b|\b4:5\b/i, formato: "feed-4-5" },
  { regex: /\bquadrad[ao]\b|\b1:1\b/i, formato: "quadrado-1-1" },
];

export function formatoPedidoExplicitamente(texto: string | undefined | null): Formato | null {
  if (!texto?.trim()) return null;
  for (const { regex, formato } of PADRAO_FORMATO_PEDIDO) {
    if (regex.test(texto)) return formato;
  }
  return null;
}
