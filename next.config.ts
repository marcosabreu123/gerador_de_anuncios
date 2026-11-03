import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp é um pacote NATIVO (binário .node por plataforma). Sem declará-lo
  // como externo, o bundler tenta empacotá-lo e a function quebra na partida:
  // medido em produção, TODA rota que importava sharp devolvia HTTP 500
  // imediato (/api/adjust, /api/edit-design, /api/melhorar-arte,
  // /api/generate-variation e a fila), enquanto as rotas sem sharp
  // respondiam 401 normalmente.
  //
  // Localmente nunca aparece: o dev server não faz o mesmo empacotamento.
  serverExternalPackages: ["sharp"],
};

export default nextConfig;
