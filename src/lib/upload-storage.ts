import { createClient } from "@/lib/supabase/client";

// Upload direto do navegador para o Storage. Usado tanto no cadastro de
// materiais do cliente quanto na arte-base da geração — por isso vive aqui,
// e não dentro de um componente.
//
// O caminho SEMPRE começa pelo id do usuário porque a policy do bucket exige
// (storage.foldername(name))[1] = auth.uid()::text. Mudar essa convenção
// quebra o upload com erro de permissão.

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";
const TAMANHO_MAXIMO = 10 * 1024 * 1024;

export async function enviarImagemParaStorage(
  arquivo: File,
  subpasta: string,
): Promise<string> {
  if (!arquivo.type.startsWith("image/")) {
    throw new Error(`"${arquivo.name}" não é uma imagem.`);
  }
  if (arquivo.size > TAMANHO_MAXIMO) {
    throw new Error(`"${arquivo.name}" passa de 10 MB.`);
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Sessão expirada. Entre de novo.");

  const ext = arquivo.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${user.id}/${subpasta}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, arquivo, { contentType: arquivo.type, upsert: false });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
