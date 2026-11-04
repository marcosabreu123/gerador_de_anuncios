"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, SearchX, Store } from "lucide-react";
import { criarCliente } from "@/app/(app)/clientes/actions";
import BotaoEnviar from "@/components/BotaoEnviar";
import Modal from "@/components/Modal";
import { Avatar, CabecalhoPagina, EstadoVazio } from "@/components/ui";

export interface ClienteCard {
  id: string;
  nome: string;
  nicho: string | null;
  ativo: boolean;
  logo: string | null;
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

  const botaoNovo = (
    <button type="button" onClick={() => setFormAberto(true)} className="btn btn-primary">
      <Plus size={16} aria-hidden="true" />
      Novo cliente
    </button>
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        descricao="Cada cliente guarda a própria identidade visual, os materiais e o saldo do pacote."
        acoes={botaoNovo}
      />

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 lg:max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
            aria-hidden="true"
          />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="input pl-9"
            placeholder="Buscar por nome ou nicho…"
            aria-label="Buscar cliente"
          />
        </div>

        {/* Atalhos que respondem "quem precisa de mim agora?" — a pergunta real
            de quem gerencia dezenas de contas. */}
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
          <Chip ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>
            Todos <Contagem>{ativos.length}</Contagem>
          </Chip>
          <Chip ativo={filtro === "em_producao"} onClick={() => setFiltro("em_producao")}>
            Em produção <Contagem>{emProducao}</Contagem>
          </Chip>
          <Chip ativo={filtro === "sem_saldo"} onClick={() => setFiltro("sem_saldo")}>
            Sem saldo <Contagem>{semSaldo}</Contagem>
          </Chip>
          {arquivados > 0 && (
            <Chip ativo={filtro === "arquivados"} onClick={() => setFiltro("arquivados")}>
              Arquivados <Contagem>{arquivados}</Contagem>
            </Chip>
          )}
        </div>
      </div>

      {formAberto && (
        <Modal titulo="Novo cliente" aoFechar={() => setFormAberto(false)}>
          <form action={criarCliente} className="flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col">
                <span className="label">Nome da empresa *</span>
                <input name="nome" required className="input" placeholder="Ex: Burger do Zé" />
              </label>
              <label className="flex flex-col">
                <span className="label">Nicho</span>
                <input name="nicho" className="input" placeholder="Ex: fast-food, gastrobar" />
              </label>
              <label className="flex flex-col">
                <span className="label">Contato</span>
                <input name="contato_nome" className="input" />
              </label>
              <label className="flex flex-col">
                <span className="label">Telefone</span>
                <input name="contato_telefone" className="input" />
              </label>
            </div>
            <BotaoEnviar className="btn btn-primary self-end">Cadastrar</BotaoEnviar>
          </form>
        </Modal>
      )}

      {visiveis.length === 0 ? (
        <div className="card">
          {ativos.length === 0 && filtro === "todos" && !busca ? (
            <EstadoVazio
              icone={Store}
              titulo="Nenhum cliente ativo"
              descricao="Cadastre a primeira empresa para começar a produzir."
              acao={botaoNovo}
            />
          ) : (
            <EstadoVazio
              icone={SearchX}
              titulo="Nada encontrado"
              descricao="Tente outro termo ou troque o filtro."
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-3">
          {visiveis.map((c) => (
            <Link key={c.id} href={`/clientes/${c.id}`} className="card card-interactive p-3.5 flex flex-col gap-3 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar nome={c.nome} src={c.logo} tamanho={40} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm leading-snug truncate" title={c.nome}>
                    {c.nome}
                  </p>
                  <p className="text-xs text-[var(--muted)] truncate">{c.nicho ?? "sem nicho"}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className={`badge ${c.saldo === 0 ? "badge-danger" : ""}`}>
                  {c.saldo === 0 ? "Sem saldo" : `${c.saldo} ${c.saldo === 1 ? "imagem" : "imagens"}`}
                </span>
                {c.temPedidoEmAndamento ? (
                  <span className="badge badge-accent">Em produção</span>
                ) : (
                  c.pecasNoMes > 0 && (
                    <span className="text-xs text-[var(--muted)]" title="Peças entregues no mês">
                      {c.pecasNoMes} no mês
                    </span>
                  )
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
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
    <button type="button" onClick={onClick} aria-pressed={ativo} className={ativo ? "chip chip-selected" : "chip"}>
      {children}
    </button>
  );
}

function Contagem({ children }: { children: React.ReactNode }) {
  return <span className="opacity-60 tabular-nums">{children}</span>;
}
