import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O overlay de texto lê os .woff do @fontsource em runtime (ver
  // src/lib/overlay/fontes.ts). Como o caminho é montado dinamicamente, o
  // tracing automático do Next não enxerga essa dependência e os arquivos
  // ficariam de fora do bundle da function — o overlay funcionaria local e
  // quebraria só em produção. Este include garante que eles subam junto.
  // Lista os arquivos exatos (mantenha em sincronia com ARQUIVO_POR_PESO em
  // src/lib/overlay/fontes.ts). Observação medida no trace: o Next acaba
  // incluindo o pacote @fontsource inteiro de qualquer forma (~90 .woff,
  // ~1,8 MB) mesmo com a lista restrita — irrelevante perto do limite de
  // tamanho da function, e o que importa é que os 3 arquivos lidos em
  // runtime estão garantidamente no bundle.
  outputFileTracingIncludes: {
    "/api/generate": [
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff",
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-600-normal.woff",
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff",
    ],
    "/api/generate-variation": [
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-400-normal.woff",
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-600-normal.woff",
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-700-normal.woff",
    ],
  },
};

export default nextConfig;
