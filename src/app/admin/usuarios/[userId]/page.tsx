import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import AppHeader from "@/components/AppHeader";
import AdminAddCredito from "@/components/AdminAddCredito";
import type { UserRow } from "@/lib/types";

// Rótulo legível do fluxo usado numa geração — lido de conversa.tipoFluxo
// quando existir (fluxo rápido de melhorar/nova versão) ou inferido pelo
// nome do projeto (fluxos mais antigos, sem esse campo ainda salvo).
function labelFluxo(conversa: unknown, nomeProjeto: string | null): string {
  const tipoFluxo = (conversa as { tipoFluxo?: string; pedido?: string } | null)?.tipoFluxo;
  if (tipoFluxo === "transformar_arte_existente") {
    const modo = (conversa as { modoTransformacao?: string } | null)?.modoTransformacao;
    return modo === "nova_versao_criativa" ? "Criar nova versão" : "Melhorar arte";
  }
  if ((conversa as { pedido?: string } | null)?.pedido) return "Editar detalhe (design enviado)";
  if (nomeProjeto === "Edição de design") return "Editar detalhe (design enviado)";
  return "Criar nova arte";
}

export default async function AdminUsuarioPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const { perfil } = await requireAdmin();
  const admin = createAdminClient();

  const { data: usuarioData } = await admin
    .from("users")
    .select("id, nome, email, creditos_disponiveis, is_admin, created_at")
    .eq("id", userId)
    .maybeSingle();
  if (!usuarioData) notFound();
  const usuario = usuarioData as Pick<
    UserRow,
    "id" | "nome" | "email" | "creditos_disponiveis" | "is_admin" | "created_at"
  >;

  const { data: projetos } = await admin
    .from("projects")
    .select("id, nome_projeto, tipo_arte, formato, status, conversa, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const projetosPorId = new Map((projetos ?? []).map((p) => [p.id, p]));

  const { data: imagens } = await admin
    .from("images")
    .select("id, project_id, imagem_original_url, imagem_gerada_url, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const lista = imagens ?? [];
  const ultimaAtividade = lista[0]?.created_at ?? projetos?.[0]?.created_at ?? null;

  return (
    <>
      <AppHeader creditos={perfil.creditos_disponiveis} isAdmin={perfil.is_admin} />
      <main className="app-shell flex-1 py-6">
        <Link href="/admin" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← Voltar pro Admin
        </Link>

        <div className="card p-4 mt-4">
          <p className="font-semibold">
            {usuario.nome || "Sem nome"}
            {usuario.is_admin && <span className="ml-2 text-xs font-semibold text-[var(--accent)]">admin</span>}
          </p>
          <p className="text-xs text-[var(--muted)]">{usuario.email}</p>

          <div className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">Créditos</p>
              <p className="font-semibold">{usuario.is_admin ? "∞" : usuario.creditos_disponiveis}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Total de artes geradas</p>
              <p className="font-semibold">{lista.length}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Cadastro</p>
              <p className="font-semibold">{new Date(usuario.created_at).toLocaleDateString("pt-BR")}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Última atividade</p>
              <p className="font-semibold">
                {ultimaAtividade ? new Date(ultimaAtividade).toLocaleDateString("pt-BR") : "—"}
              </p>
            </div>
          </div>

          {!usuario.is_admin && (
            <div className="mt-4">
              <AdminAddCredito userId={usuario.id} />
            </div>
          )}
        </div>

        <h2 className="font-semibold mt-6 mb-3">Histórico de gerações</h2>
        {lista.length === 0 ? (
          <p className="text-sm text-[var(--muted)] text-center py-8">Nenhuma geração ainda.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {lista.map((img) => {
              const projeto = projetosPorId.get(img.project_id);
              return (
                <div key={img.id} className="card p-3 flex gap-3 items-center">
                  <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-[var(--surface-muted)]">
                    {img.imagem_gerada_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img.imagem_gerada_url} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{projeto?.nome_projeto || "Sem nome"}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {labelFluxo(projeto?.conversa, projeto?.nome_projeto ?? null)} · {img.status}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{new Date(img.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                  {img.imagem_gerada_url && (
                    <a
                      href={img.imagem_gerada_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-[var(--accent)] shrink-0"
                    >
                      Abrir
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
