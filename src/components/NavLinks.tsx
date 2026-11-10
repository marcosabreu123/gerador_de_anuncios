"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Palette, Settings, Store, Wallet, type LucideIcon } from "lucide-react";

const ITENS: {
  href: string;
  rotulo: string;
  // Na barra do celular cabem cinco itens de uns 75px: "Configurações" não cabe.
  rotuloCurto?: string;
  icone: LucideIcon;
  soSocio: boolean;
}[] = [
  { href: "/dashboard", rotulo: "Painel", icone: LayoutDashboard, soSocio: true },
  { href: "/producao", rotulo: "Produção", icone: Palette, soSocio: false },
  { href: "/clientes", rotulo: "Clientes", icone: Store, soSocio: true },
  { href: "/financeiro", rotulo: "Financeiro", icone: Wallet, soSocio: true },
  { href: "/configuracoes", rotulo: "Configurações", rotuloCurto: "Ajustes", icone: Settings, soSocio: true },
];

export interface AlertaDoMenu {
  // O que aparece no selo ao lado do item: um número ou "!".
  valor: string;
  // O que o leitor de tela e a dica do mouse dizem.
  descricao: string;
  tom: "warning" | "danger";
}

// A navegação muda por papel: colaborador só vê a Produção, porque não tem acesso
// a dinheiro nem gestão de equipe. Esconder não é a proteção — as telas são
// barradas no servidor por requireSocio — mas mostrar link que leva a um
// redirect é UX ruim.
export default function NavLinks({
  ehSocio,
  variante,
  alertas = {},
}: {
  ehSocio: boolean;
  variante: "lateral" | "barra";
  // Selo ao lado do item, por href: clientes que pedem ação, saldo da OpenAI acabando.
  alertas?: Record<string, AlertaDoMenu>;
}) {
  const caminho = usePathname();
  const itens = ITENS.filter((item) => ehSocio || !item.soSocio);

  // O pedido e a página de cada cliente são onde as artes são feitas: contam como
  // Produção. "Clientes" é só a carteira.
  const ativo = (href: string) => {
    if (href === "/producao") {
      return caminho.startsWith("/producao") || caminho.startsWith("/pedidos") || caminho.startsWith("/clientes/");
    }
    if (href === "/clientes") return caminho === "/clientes";
    return caminho.startsWith(href);
  };

  const descricao = (rotulo: string, alerta?: AlertaDoMenu) => (alerta ? `${rotulo}: ${alerta.descricao}` : undefined);

  if (variante === "lateral") {
    return (
      <nav className="flex flex-col gap-0.5" aria-label="Principal">
        {itens.map(({ href, rotulo, icone: Icone }) => {
          const alerta = alertas[href];
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
              {alerta && (
                <span className={`ml-auto badge badge-${alerta.tom} px-2 tabular-nums`} aria-hidden="true">
                  {alerta.valor}
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
      {itens.map(({ href, rotulo, rotuloCurto, icone: Icone }) => {
        const alerta = alertas[href];
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo(href) ? "page" : undefined}
            aria-label={descricao(rotulo, alerta) ?? (rotuloCurto ? rotulo : undefined)}
            className={`flex-1 min-w-0 flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium ${
              ativo(href) ? "text-[var(--foreground)]" : "text-[var(--muted)]"
            }`}
          >
            <span className="relative">
              <Icone size={20} aria-hidden="true" />
              {alerta && (
                <span
                  aria-hidden="true"
                  className={`absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full text-[10px] leading-4 font-semibold text-center text-[var(--background)] tabular-nums ${
                    alerta.tom === "danger" ? "bg-[var(--danger)]" : "bg-[var(--warning)]"
                  }`}
                >
                  {alerta.valor}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">{rotuloCurto ?? rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
