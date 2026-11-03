import Link from "next/link";
import { signout } from "@/app/login/actions";
import ThemeToggle from "@/components/ThemeToggle";

// Header da operação interna. Substitui o AppHeader do modelo antigo, que
// exibia o saldo de créditos do lojista logado — aqui quem loga é o operador,
// e saldo é coisa do cliente atendido, não de quem está usando o app.
export default function AgenciaHeader({ nome }: { nome?: string | null }) {
  return (
    <header className="sticky top-0 z-10 bg-[var(--background)]/90 backdrop-blur border-b border-[var(--border)] transition-colors">
      <div className="app-shell flex items-center justify-between h-14 gap-2">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/dashboard" className="font-bold tracking-tight shrink-0">
            Artes<span className="text-[var(--accent)]"> IA</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/dashboard" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              Painel
            </Link>
            <Link href="/clientes" className="text-[var(--muted)] hover:text-[var(--foreground)]">
              Clientes
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 min-w-0">
          {nome && <span className="text-sm text-[var(--muted)] truncate hidden sm:block">{nome}</span>}
          <ThemeToggle />
          <form action={signout} className="shrink-0">
            <button
              type="submit"
              title="Sair"
              className="flex items-center justify-center w-9 h-9 rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
            >
              <span aria-hidden="true">⎋</span>
              <span className="sr-only">Sair</span>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
