import Link from "next/link";
import { LogOut } from "lucide-react";
import { signout } from "@/app/login/actions";
import NavLinks, { type AlertaDoMenu } from "@/components/NavLinks";
import ThemeToggle from "@/components/ThemeToggle";
import { Avatar, Marca } from "@/components/ui";
import { formatarUSD } from "@/lib/agencia/types";
import type { SaldoOpenAI } from "@/lib/agencia/financeiro";
import { PAPEIS, type PapelUsuario } from "@/lib/types";

// Moldura da operação interna. No PC o menu fica fixo na lateral e o conteúdo
// usa o resto da tela; no celular o menu vira barra inferior, ao alcance do
// polegar. Colaborador só tem uma tela de entrada, então não ganha barra.
export default function AppShell({
  nome,
  papel,
  alertasCobranca = 0,
  saldoOpenAI = null,
  children,
}: {
  nome: string;
  papel: PapelUsuario;
  // Clientes com plano vencendo, vencido, sem plano ou com pagamento em aberto (só sócio).
  alertasCobranca?: number;
  // Saldo estimado da OpenAI (só sócio). O Financeiro avisa quando está acabando.
  saldoOpenAI?: SaldoOpenAI | null;
  children: React.ReactNode;
}) {
  const ehSocio = papel === "socio";
  const inicio = ehSocio ? "/dashboard" : "/producao";

  const alertas: Record<string, AlertaDoMenu> = {};
  if (alertasCobranca > 0) {
    alertas["/clientes"] = {
      valor: String(alertasCobranca),
      descricao: `${alertasCobranca} ${alertasCobranca === 1 ? "cliente pede" : "clientes pedem"} atenção`,
      tom: "warning",
    };
  }
  if (saldoOpenAI?.saldoUsd != null && saldoOpenAI.baixo) {
    alertas["/financeiro"] = {
      valor: "!",
      descricao: saldoOpenAI.acabou
        ? "o crédito da OpenAI acabou"
        : `o crédito da OpenAI está acabando, uns ${formatarUSD(saldoOpenAI.saldoUsd)}`,
      tom: saldoOpenAI.acabou ? "danger" : "warning",
    };
  }

  const sair = (
    <form action={signout} className="shrink-0">
      <button type="submit" title="Sair" className="btn btn-ghost btn-icone">
        <LogOut size={16} aria-hidden="true" />
        <span className="sr-only">Sair</span>
      </button>
    </form>
  );

  return (
    <div className="flex-1 flex flex-col lg:pl-[var(--sidebar)]">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-20 w-[var(--sidebar)] flex-col gap-6 border-r border-[var(--border)] bg-[var(--sidebar-bg)] px-3 py-4">
        <Link href={inicio} className="px-2 pt-1">
          <Marca />
        </Link>

        <NavLinks ehSocio={ehSocio} variante="lateral" alertas={alertas} />

        <div className="mt-auto flex flex-col gap-3">
          <ThemeToggle variante="seletor" />
          <div className="flex items-center gap-2.5 border-t border-[var(--border)] pt-3 pl-1">
            <Avatar nome={nome} tamanho={32} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium truncate" title={nome}>
                {nome}
              </p>
              <p className="text-xs text-[var(--muted)]">{PAPEIS[papel].label}</p>
            </div>
            {sair}
          </div>
        </div>
      </aside>

      <header className="lg:hidden sticky top-0 z-20 flex items-center justify-between h-14 px-4 border-b border-[var(--border)] bg-[var(--sidebar-bg)]/95 backdrop-blur">
        <Link href={inicio}>
          <Marca />
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle variante="botao" />
          {sair}
        </div>
      </header>

      <div className="fundo-pagina flex-1 flex flex-col">{children}</div>

      {ehSocio && <NavLinks ehSocio variante="barra" alertas={alertas} />}
    </div>
  );
}
