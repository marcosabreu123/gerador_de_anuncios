"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Store, Wallet, type LucideIcon } from "lucide-react";

const ITENS: { href: string; rotulo: string; icone: LucideIcon; soSocio: boolean }[] = [
  { href: "/dashboard", rotulo: "Painel", icone: LayoutDashboard, soSocio: true },
  { href: "/clientes", rotulo: "Clientes", icone: Store, soSocio: false },
  { href: "/cobrancas", rotulo: "Cobranças", icone: Wallet, soSocio: true },
  { href: "/configuracoes", rotulo: "Configurações", icone: Settings, soSocio: true },
];

// A navegação muda por papel: colaborador não vê Painel, Cobranças nem
// Configurações, porque não tem acesso a dinheiro nem gestão de equipe. Esconder
// não é a proteção — as telas são barradas no servidor por requireSocio — mas
// mostrar link que leva a um redirect é UX ruim.
export default function NavLinks({
  ehSocio,
  variante,
  alertas = {},
}: {
  ehSocio: boolean;
  variante: "lateral" | "barra";
  // Número ao lado do item, por href. Cobranças mostra quantos clientes pedem ação.
  alertas?: Record<string, number>;
}) {
  const caminho = usePathname();
  const itens = ITENS.filter((item) => ehSocio || !item.soSocio);

  // Pedido não tem item próprio: ele sempre pertence a um cliente.
  const ativo = (href: string) =>
    caminho.startsWith(href) || (href === "/clientes" && caminho.startsWith("/pedidos"));

  const descricao = (rotulo: string, alerta: number) =>
    alerta > 0 ? `${rotulo}: ${alerta} ${alerta === 1 ? "cliente pede" : "clientes pedem"} atenção` : undefined;

  if (variante === "lateral") {
    return (
      <nav className="flex flex-col gap-0.5" aria-label="Principal">
        {itens.map(({ href, rotulo, icone: Icone }) => {
          const alerta = alertas[href] ?? 0;
          return (
            <Link
              key={href}
              href={href}
              className="nav-item"
              aria-current={ativo(href) ? "page" : undefined}
              aria-label={descricao(rotulo, alerta)}
              title={descricao(rotulo, alerta)}
            >
              <Icone size={17} aria-hidden="true" />
              {rotulo}
              {alerta > 0 && (
                <span className="ml-auto badge badge-warning px-2 tabular-nums" aria-hidden="true">
                  {alerta}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Principal"
      className="lg:hidden fixed inset-x-0 bottom-0 z-20 flex border-t border-[var(--border)] bg-[var(--sidebar-bg)]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      {itens.map(({ href, rotulo, icone: Icone }) => {
        const alerta = alertas[href] ?? 0;
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo(href) ? "page" : undefined}
            aria-label={descricao(rotulo, alerta)}
            className={`flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium ${
              ativo(href) ? "text-[var(--foreground)]" : "text-[var(--muted)]"
            }`}
          >
            <span className="relative">
              <Icone size={20} aria-hidden="true" />
              {alerta > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-[var(--warning)] text-[10px] leading-4 font-semibold text-center text-[var(--background)] tabular-nums"
                >
                  {alerta}
                </span>
              )}
            </span>
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
