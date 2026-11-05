import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp é um pacote NATIVO (binário .node + libvips .so por plataforma).
  // Declarado como externo, o Next o carrega de node_modules em runtime em
  // vez de empacotá-lo.
  serverExternalPackages: ["sharp"],

  // Mas marcar como externo não basta: o rastreamento de arquivos não leva
  // os .so junto para o bundle da function, e o carregamento falha com
  // "ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object
  // file" (erro capturado em produção). Este include força os binários a
  // irem junto. Os pacotes @img só existem na plataforma do build, então na
  // Vercel (linux-x64) resolvem e no Windows são simplesmente ignorados.
  //
  // A tela de nova geração entra na lista porque relê as referências depois de abrir.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/@img/**/*"],
    "/clientes/*/nova-geracao": ["./node_modules/@img/**/*"],
  },
};

export default nextConfig;
