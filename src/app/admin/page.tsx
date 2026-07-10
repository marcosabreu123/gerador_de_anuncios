import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import AppHeader from "@/components/AppHeader";
import AdminAddCredito from "@/components/AdminAddCredito";
import type { UserRow } from "@/lib/types";

// Painel interno: só quem tem is_admin = true acessa (requireAdmin). Usa o
// client admin (service role) para enxergar todos os usuários — a RLS de
// public.users só libera cada um ver a própria linha.
export default async function AdminPage() {
  const { perfil } = await requireAdmin();

  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("id, nome, email, creditos_disponiveis, is_admin, created_at")
    .order("created_at", { ascending: false });

  const usuarios = (data ?? []) as Pick<
    UserRow,
    "id" | "nome" | "email" | "creditos_disponiveis" | "is_admin" | "created_at"
  >[];

  // Contagem de gerações por usuário — não existe uma tabela "generations"
  // separada, cada linha de public.images já É uma geração vinculada ao
  // usuário que criou (user_id). Conta no servidor em vez de criar view nova.
  const { data: todasImagens } = await admin.from("images").select("user_id, created_at");
  const contagemPorUsuario = new Map<string, number>();
  const ultimaAtividadePorUsuario = new Map<string, string>();
  for (const img of todasImagens ?? []) {
    contagemPorUsuario.set(img.user_id, (contagemPorUsuario.get(img.user_id) ?? 0) + 1);
    const atual = ultimaAtividadePorUsuario.get(img.user_id);
    if (!atual || img.created_at > atual) ultimaAtividadePorUsuario.set(img.user_id, img.created_at);
  }

  return (
    <>
      <AppHeader creditos={perfil.creditos_disponiveis} isAdmin={perfil.is_admin} />
      <main className="app-shell flex-1 py-6">
        <h1 className="text-xl font-bold mb-1">Admin</h1>
        <p className="text-sm text-[var(--muted)] mb-1">Perfis / Usuários</p>
        <p className="text-sm text-[var(--muted)] mb-6">
          Créditos e histórico de gerações de todos os usuários. Você pode adicionar ou remover créditos de
          qualquer conta (informe um número negativo para remover).
        </p>

        <div className="flex flex-col gap-3">
          {usuarios.map((u) => (
            <div key={u.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">
                    {u.nome || "Sem nome"}
                    {u.is_admin && (
                      <span className="ml-2 text-xs font-semibold text-[var(--accent)]">admin</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted)] truncate">{u.email}</p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {contagemPorUsuario.get(u.id) ?? 0} arte{(contagemPorUsuario.get(u.id) ?? 0) === 1 ? "" : "s"} gerada
                    {(contagemPorUsuario.get(u.id) ?? 0) === 1 ? "" : "s"}
                    {ultimaAtividadePorUsuario.has(u.id) && (
                      <> · última atividade em {new Date(ultimaAtividadePorUsuario.get(u.id)!).toLocaleDateString("pt-BR")}</>
                    )}
                  </p>
                </div>
                <p className="text-sm font-semibold whitespace-nowrap">
                  {u.is_admin ? "∞" : u.creditos_disponiveis} crédito
                  {!u.is_admin && u.creditos_disponiveis === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 mt-3">
                {!u.is_admin ? <AdminAddCredito userId={u.id} /> : <span />}
                <Link href={`/admin/usuarios/${u.id}`} className="text-xs font-semibold text-[var(--accent)] shrink-0">
                  Ver histórico →
                </Link>
              </div>
            </div>
          ))}

          {usuarios.length === 0 && (
            <p className="text-sm text-[var(--muted)] text-center py-8">Nenhum usuário encontrado.</p>
          )}
        </div>
      </main>
    </>
  );
}
