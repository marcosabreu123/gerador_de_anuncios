import { createClient } from "@/lib/supabase/server";
import type { ImagemGerada } from "@/lib/ai/gemini";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

function extDoMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  return "png";
}

// Sobe uma imagem (base64) para o Storage na pasta do usuário e retorna a URL pública.
// Caminho: <userId>/<subpasta>/<arquivo> — casa com as policies de Storage do schema.
export async function uploadImagem(
  userId: string,
  imagem: ImagemGerada,
  subpasta: "originais" | "geradas",
): Promise<string> {
  const supabase = await createClient();
  const ext = extDoMime(imagem.mimeType);
  const nome = `${crypto.randomUUID()}.${ext}`;
  const path = `${userId}/${subpasta}/${nome}`;
  const bytes = Buffer.from(imagem.base64, "base64");

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: imagem.mimeType,
    upsert: false,
  });
  if (error) {
    console.error("[storage] upload falhou:", error);
    throw new Error("Falha ao salvar a imagem no Storage.");
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
