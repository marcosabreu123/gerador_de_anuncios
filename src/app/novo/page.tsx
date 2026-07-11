import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import ChatWizard from "@/components/ChatWizard";

export default async function NovoPage() {
  const { perfil } = await requireUser();

  // Sem créditos → não deixa entrar no fluxo (admin tem créditos ilimitados).
  if (!perfil.is_admin && perfil.creditos_disponiveis <= 0) redirect("/dashboard");

  return (
    <>
      <AppHeader creditos={perfil.creditos_disponiveis} isAdmin={perfil.is_admin} />
      <main className="creation-shell flex flex-col py-4 h-[calc(100dvh-3.5rem)]">
        {/* No mobile isso é uma coluna só (a sidebar não existe, ver classe
            "hidden lg:flex") — no desktop vira um grid de verdade, sem
            mexer no ChatWizard em si (conversa, materiais, cards). */}
        <div className="creation-layout flex-1 min-h-0">
          <aside className="hidden lg:flex flex-col gap-2 min-h-0">
            <Link href="/dashboard" className="card p-3 text-sm font-semibold hover:border-[var(--accent)] transition-colors">
              ← Início
            </Link>
            <Link href="/historico" className="card p-3 text-sm font-semibold hover:border-[var(--accent)] transition-colors">
              Histórico
            </Link>
            {perfil.is_admin && (
              <Link href="/admin" className="card p-3 text-sm font-semibold hover:border-[var(--accent)] transition-colors">
                Admin
              </Link>
            )}
            <div className="card p-3 text-xs text-[var(--muted)] mt-auto">
              {perfil.is_admin
                ? "Créditos ilimitados (admin)."
                : `Você tem ${perfil.creditos_disponiveis} crédito${perfil.creditos_disponiveis === 1 ? "" : "s"}.`}
            </div>
          </aside>
          <div className="flex flex-col h-full min-h-0">
            <ChatWizard />
          </div>
        </div>
      </main>
    </>
  );
}
