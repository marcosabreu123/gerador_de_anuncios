import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/types";

// Retorna o usuário autenticado + sua row em public.users.
// Se a row ainda não existir (trigger não rodou), provisiona na hora.
// Redireciona para /login se não houver sessão.
export async function requireUser(): Promise<{ authId: string; email: string; perfil: UserRow }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  let { data: perfil } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil) {
    const { data: novo } = await supabase
      .from("users")
      .insert({
        id: user.id,
        email: user.email,
        nome: (user.user_metadata?.nome as string) ?? null,
        creditos_disponiveis: 3,
      })
      .select("*")
      .single();
    perfil = novo;
  }

  return { authId: user.id, email: user.email!, perfil: perfil as UserRow };
}
