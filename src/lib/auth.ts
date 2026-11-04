import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/types";

// Retorna o usuário autenticado + sua row em public.users.
// Se a row ainda não existir (trigger não rodou), provisiona na hora — e aí
// ela nasce com papel 'sem_acesso' (default da coluna), nunca com acesso.
// Redireciona para /login se não houver sessão.
async function buscarUsuario(): Promise<{ authId: string; email: string; perfil: UserRow }> {
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
      })
      .select("*")
      .single();
    perfil = novo;
  }

  return { authId: user.id, email: user.email!, perfil: perfil as UserRow };
}

// Layout e página pedem o usuário no mesmo carregamento. Sem o cache seriam duas
// idas ao Supabase Auth por tela.
export const requireUser = cache(buscarUsuario);

// Acesso à operação (clientes e geração). Vale para sócio e colaborador.
//
// Barra explicitamente quem não tem papel: as contas do modelo antigo
// (lojistas do tempo do self-service) continuam autenticando no Supabase, e
// sem esta checagem entrariam direto na ferramenta interna.
export async function requireOperador() {
  const resultado = await requireUser();
  const { papel, ativo } = resultado.perfil;
  if (!ativo || (papel !== "socio" && papel !== "colaborador")) {
    redirect("/sem-acesso");
  }
  return resultado;
}

// Acesso de gestão: painel, custo, pacotes, pagamentos e configurações.
// Só sócio. Colaborador que tentar abrir uma dessas telas volta para a área
// que lhe cabe, em vez de ver um erro seco.
export async function requireSocio() {
  const resultado = await requireOperador();
  if (resultado.perfil.papel !== "socio") {
    redirect("/clientes");
  }
  return resultado;
}

export function ehSocio(perfil: Pick<UserRow, "papel">): boolean {
  return perfil.papel === "socio";
}
