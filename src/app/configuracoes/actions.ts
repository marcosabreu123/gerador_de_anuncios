"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PapelUsuario } from "@/lib/types";

// Gestão de acesso da equipe. Todas as ações aqui exigem sócio — um
// colaborador não pode se promover nem criar logins.

export interface EstadoNovoUsuario {
  erro?: string;
  sucesso?: string;
  // Mostrada UMA vez, logo após criar, para o sócio repassar ao convidado.
  // Não fica salva em lugar nenhum: o Supabase guarda só o hash.
  senhaTemporaria?: string;
  emailCriado?: string;
}

// Senha inicial gerada pelo sistema. O sócio não digita senha de outra
// pessoa — ele cria o acesso, entrega esta senha e a pessoa troca depois.
function gerarSenhaTemporaria(): string {
  // base64url evita caracteres que confundem na hora de ditar/colar.
  return crypto.randomBytes(9).toString("base64url");
}

export async function criarUsuario(
  _anterior: EstadoNovoUsuario,
  form: FormData,
): Promise<EstadoNovoUsuario> {
  const { authId } = await requireSocio();

  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const papel = String(form.get("papel") ?? "colaborador") as PapelUsuario;
  const nome = String(form.get("nome") ?? "").trim() || null;

  if (!email || !email.includes("@")) {
    return { erro: "Informe um e-mail válido." };
  }
  if (papel !== "socio" && papel !== "colaborador") {
    return { erro: "Papel inválido." };
  }

  const admin = createAdminClient();
  const senha = gerarSenhaTemporaria();

  // email_confirm: true porque o convite vem de dentro da equipe — não faz
  // sentido exigir que a pessoa confirme um e-mail que o sócio acabou de
  // digitar. Sem isso ela não conseguiria entrar até clicar num link.
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: nome ? { nome } : undefined,
  });

  if (error || !data.user) {
    const msg = error?.message ?? "";
    if (/already been registered|already exists/i.test(msg)) {
      return {
        erro: "Já existe uma conta com esse e-mail. Use a lista abaixo para dar acesso a ela.",
      };
    }
    return { erro: msg || "Não foi possível criar o acesso." };
  }

  // A trigger do Supabase cria a row em public.users com papel 'sem_acesso';
  // o upsert garante o papel certo mesmo se a trigger não tiver rodado.
  const { error: erroPerfil } = await admin.from("users").upsert(
    {
      id: data.user.id,
      email,
      nome,
      papel,
      ativo: true,
      convidado_por: authId,
    },
    { onConflict: "id" },
  );

  if (erroPerfil) {
    console.error("[configuracoes] usuário criado no auth mas o perfil falhou:", erroPerfil);
    return {
      erro: "O login foi criado, mas o papel não foi gravado. Ajuste pela lista abaixo.",
    };
  }

  revalidatePath("/configuracoes");
  return {
    sucesso: "Acesso criado.",
    senhaTemporaria: senha,
    emailCriado: email,
  };
}

export async function alterarPapel(form: FormData) {
  const { authId } = await requireSocio();
  const id = String(form.get("id") ?? "");
  const papel = String(form.get("papel") ?? "") as PapelUsuario;
  if (!id || !["socio", "colaborador", "sem_acesso"].includes(papel)) return;

  // Trava de segurança: um sócio não pode rebaixar a própria conta e se
  // trancar fora da gestão por engano.
  if (id === authId && papel !== "socio") return;

  const supabase = await createClient();
  await supabase.from("users").update({ papel }).eq("id", id);
  revalidatePath("/configuracoes");
}

export async function alterarAtivo(form: FormData) {
  const { authId } = await requireSocio();
  const id = String(form.get("id") ?? "");
  const ativo = form.get("ativo") === "true";
  if (!id) return;

  // Mesma trava: ninguém se desativa sozinho.
  if (id === authId && !ativo) return;

  const supabase = await createClient();
  await supabase.from("users").update({ ativo }).eq("id", id);
  revalidatePath("/configuracoes");
}

// Dispara o e-mail de redefinição do Supabase. Útil quando a pessoa perdeu a
// senha temporária — evita o sócio ter que criar outro acesso.
export async function enviarRedefinicaoSenha(form: FormData) {
  await requireSocio();
  const email = String(form.get("email") ?? "").trim();
  if (!email) return;

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email);
  if (error) console.error("[configuracoes] falha ao enviar redefinição:", error);
  revalidatePath("/configuracoes");
}
