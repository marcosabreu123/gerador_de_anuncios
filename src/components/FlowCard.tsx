import Link from "next/link";

// Card de escolha de fluxo principal (tela inicial) — ícone + título +
// descrição curta + seta, com hover/press definidos em .card-interactive.
export default function FlowCard({
  href,
  icon,
  title,
  description,
  destaque = false,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  destaque?: boolean;
}) {
  return (
    <Link href={href} className="card card-interactive flex items-center gap-4 p-4">
      <span
        className={`flex items-center justify-center w-11 h-11 rounded-xl text-xl shrink-0 ${
          destaque ? "gradiente-ia-bg" : "bg-[var(--accent-soft)]"
        }`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-xs text-[var(--muted)] mt-0.5">{description}</p>
      </div>
      <svg
        className="text-[var(--muted)] shrink-0"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}
