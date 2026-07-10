import Link from "next/link";
import { signout } from "@/app/login/actions";
import ThemeToggle from "@/components/ThemeToggle";

export default function AppHeader({
  creditos,
  isAdmin,
}: {
  creditos: number;
  isAdmin?: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 bg-[var(--background)]/90 backdrop-blur border-b border-[var(--border)] transition-colors">
      <div className="app-shell flex items-center justify-between h-14 gap-2">
        <Link href="/dashboard" className="font-bold tracking-tight shrink-0">
          Artes<span className="text-[var(--accent)]"> IA</span>
        </Link>

        <div className="flex items-center gap-2 min-w-0">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-sm font-semibold text-[var(--muted)] hover:text-[var(--foreground)] shrink-0"
            >
              Admin
            </Link>
          )}
          <Link
            href="/dashboard"
            className="badge shrink-0"
            title={isAdmin ? "Créditos ilimitados (admin)" : "Créditos disponíveis"}
          >
            <span className="text-[var(--accent)]" aria-hidden="true">◆</span>
            {isAdmin ? "∞" : creditos}
          </Link>
          <ThemeToggle />
          <form action={signout} className="shrink-0">
            <button
              type="submit"
              className="flex items-center justify-center w-9 h-9 rounded-full text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
              aria-label="Sair da conta"
              title="Sair"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
