import Link from "next/link";
import { signout } from "@/app/login/actions";

export default function AppHeader({ creditos }: { creditos: number }) {
  return (
    <header className="sticky top-0 z-10 bg-[var(--background)]/90 backdrop-blur border-b border-[var(--border)]">
      <div className="app-shell flex items-center justify-between h-14">
        <Link href="/dashboard" className="font-bold tracking-tight">
          Artes<span className="text-[var(--accent)]"> IA</span>
        </Link>

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 text-sm font-semibold bg-[var(--accent-soft)] text-[var(--foreground)] px-3 py-1.5 rounded-full"
            title="Créditos disponíveis"
          >
            <span className="text-[var(--accent)]">◆</span>
            {creditos}
          </Link>
          <form action={signout}>
            <button type="submit" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
              Sair
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
