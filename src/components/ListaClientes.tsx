"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { criarCliente } from "@/app/clientes/actions";

export interface ClienteCard {
  id: string;
  nome: string;
  nicho: string | null;
  ativo: boolean;
  saldo: number;
  pecasNoMes: number;
  temPedidoEmAndamento: boolean;
}

// Lista de clientes pensada para escala: com 20, 50 ou 100 empresas, o que
// importa é achar rápido e enxergar quem precisa de atenção. Por isso cards
// compactos, busca no topo e o cadastro escondido atrás de um botão — criar
// cliente é eventual, achar cliente é o tempo todo.
export default function ListaClientes({ clientes }: { clientes: ClienteCard[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "sem_saldo" | "em_producao" | "arquivados">(
    "todos",
  );
  const [formAberto, setFormAberto] = useState(false);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      // Arquivado só aparece em "Arquivados": cliente que saiu não ocupa a
      // grade de quem está sendo atendido hoje.
      if (filtro === "arquivados" ? c.ativo : !c.ativo) return false;
      if (filtro === "sem_saldo" && c.saldo > 0) return false;
      if (filtro === "em_producao" && !c.temPedidoEmAndamento) return false;
      if (!termo) return true;
      return (
        c.nome.toLowerCase().includes(termo) || (c.nicho ?? "").toLowerCase().includes(termo)
      );
    });
  }, [clientes, busca, filtro]);

  const ativos = clientes.filter((c) => c.ativo);
  const semSaldo = ativos.filter((c) => c.saldo === 0).length;
  const emProducao = ativos.filter((c) => c.temPedidoEmAndamento).length;
  const arquivados = clientes.length - ativos.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="input flex-1 min-w-[180px]"
          placeholder="Buscar por nome ou nicho…"
        />
        <button
          type="button"
          onClick={() => setFormAberto((v) => !v)}
          className="btn btn-primary shrink-0"
        >
          + Novo cliente
        </button>
      </div>

      {/* Atalhos que respondem "quem precisa de mim agora?" — a pergunta real
          de quem gerencia dezenas de contas. */}
      <div className="flex flex-wrap gap-2">
        <Chip ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>
          Todos ({ativos.length})
        </Chip>
        <Chip ativo={filtro === "em_producao"} onClick={() => setFiltro("em_producao")}>
          Em produção ({emProducao})
        </Chip>
        <Chip ativo={filtro === "sem_saldo"} onClick={() => setFiltro("sem_saldo")}>
          Sem saldo ({semSaldo})
        </Chip>
        {arquivados > 0 && (
          <Chip ativo={filtro === "arquivados"} onClick={() => setFiltro("arquivados")}>
            Arquivados ({arquivados})
          </Chip>
        )}
      </div>

      {formAberto && (
        <form action={criarCliente} className="card p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold">Novo cliente</h2>
            <button
              type="button"
              onClick={() => setFormAberto(false)}
              className="text-[var(--muted)] hover:text-[var(--foreground)]"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="label">Nome da empresa *</span>
              <input name="nome" required className="input" placeholder="Ex: Burger do Zé" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Nicho</span>
              <input name="nicho" className="input" placeholder="Ex: fast-food, gastrobar" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Contato</span>
              <input name="contato_nome" className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Telefone</span>
              <input name="contato_telefone" className="input" />
            </label>
          </div>
          <button type="submit" className="btn btn-primary self-start">
            Cadastrar
          </button>
        </form>
      )}

      {visiveis.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="font-semibold">
            {clientes.length === 0 ? "Nenhum cliente ainda" : "Nada encontrado"}
          </p>
          <p className="text-sm text-[var(--muted)] mt-1">
            {clientes.length === 0
              ? "Cadastre o primeiro para começar a produzir."
              : "Tente outro termo ou troque o filtro."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {visiveis.map((c) => (
            <Link
              key={c.id}
              href={`/clientes/${c.id}`}
              className="card card-interactive p-3 flex flex-col gap-1 min-w-0"
            >
              <div className="flex items-start justify-between gap-1">
                <p className="font-semibold text-sm leading-tight truncate" title={c.nome}>
                  {c.nome}
                </p>
                {c.temPedidoEmAndamento && (
                  <span
                    className="w-2 h-2 rounded-full bg-[var(--accent)] shrink-0 mt-1"
                    title="Pedido em produção"
                    aria-label="Pedido em produção"
                  />
                )}
              </div>
              <p className="text-[11px] text-[var(--muted)] truncate">{c.nicho ?? "sem nicho"}</p>
              <div className="flex items-center justify-between gap-1 mt-1">
                <span
                  className={`text-[11px] font-medium ${
                    c.saldo === 0 ? "text-[var(--danger)]" : "text-[var(--muted)]"
                  }`}
                >
                  {c.saldo === 0 ? "sem saldo" : `${c.saldo} img`}
                </span>
                {c.pecasNoMes > 0 && (
                  <span className="text-[11px] text-[var(--muted)]" title="Peças entregues no mês">
                    {c.pecasNoMes} no mês
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={ativo ? "chip chip-selected" : "chip"}>
      {children}
    </button>
  );
}
