"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Store, type LucideIcon } from "lucide-react";

const ITENS: { href: string; rotulo: string; icone: LucideIcon; soSocio: boolean }[] = [
  { href: "/dashboard", rotulo: "Painel", icone: LayoutDashboard, soSocio: true },
  { href: "/clientes", rotulo: "Clientes", icone: Store, soSocio: false },
  { href: "/configuracoes", rotulo: "Configurações", icone: Settings, soSocio: true },
];

// A navegação muda por papel: colaborador não vê Painel nem Configurações,
// porque não tem acesso a custo, margem nem gestão de equipe. Esconder não é
// a proteção — as telas são barradas no servidor por requireSocio — mas
// mostrar link que leva a um redirect é UX ruim.
export default function NavLinks({
  ehSocio,
  variante,
}: {
  ehSocio: boolean;
  variante: "lateral" | "barra";
}) {
  const caminho = usePathname();
  const itens = ITENS.filter((item) => ehSocio || !item.soSocio);

  // Pedido não tem item próprio: ele sempre pertence a um cliente.
  const ativo = (href: string) =>
    caminho.startsWith(href) || (href === "/clientes" && caminho.startsWith("/pedidos"));

  if (variante === "lateral") {
    return (
      <nav className="flex flex-col gap-0.5" aria-label="Principal">
        {itens.map(({ href, rotulo, icone: Icone }) => (
          <Link key={href} href={href} className="nav-item" aria-current={ativo(href) ? "page" : undefined}>
            <Icone size={17} aria-hidden="true" />
            {rotulo}
          </Link>
        ))}
      </nav>
    );
  }

  return (
    <nav
      aria-label="Principal"
      className="lg:hidden fixed inset-x-0 bottom-0 z-20 flex border-t border-[var(--border)] bg-[var(--sidebar-bg)]/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
    >
      {itens.map(({ href, rotulo, icone: Icone }) => (
        <Link
          key={href}
          href={href}
          aria-current={ativo(href) ? "page" : undefined}
          className={`flex-1 flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium ${
            ativo(href) ? "text-[var(--foreground)]" : "text-[var(--muted)]"
          }`}
        >
          <Icone size={20} aria-hidden="true" />
          {rotulo}
        </Link>
      ))}
    </nav>
  );
}
