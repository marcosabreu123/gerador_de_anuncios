import { NextResponse } from "next/server";

export const runtime = "nodejs";

// TEMPORÁRIO — diagnóstico do carregamento do sharp em produção.
//
// Existe porque toda rota que importa sharp devolve HTTP 500 imediato na
// Vercel, enquanto local (inclusive com build de produção) responde normal.
// O import estático quebraria esta rota junto; o import DINÂMICO dentro do
// try deixa a rota subir e devolver o erro real em JSON, que é a informação
// que falta para corrigir.
//
// Remover assim que o problema estiver resolvido.
export async function GET() {
  const info: Record<string, unknown> = {
    node: process.version,
    plataforma: `${process.platform}-${process.arch}`,
    vercelRegion: process.env.VERCEL_REGION ?? null,
  };

  try {
    const mod = await import("sharp");
    const sharp = mod.default;
    info.sharpCarregou = true;
    info.sharpVersao = sharp.versions?.sharp ?? null;
    info.libvips = sharp.versions?.vips ?? null;

    // Carregar não basta: só usando é que o binário nativo é exercitado.
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    info.sharpFunciona = png.length > 0;
  } catch (e) {
    info.sharpCarregou = false;
    info.erro = e instanceof Error ? e.message : String(e);
    info.stack = e instanceof Error ? e.stack?.split("\n").slice(0, 6).join(" | ") : null;
  }

  return NextResponse.json(info);
}
