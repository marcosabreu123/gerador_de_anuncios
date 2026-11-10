"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, SearchX, Store } from "lucide-react";
import { criarCliente } from "@/app/(app)/clientes/actions";
import BotaoEnviar from "@/components/BotaoEnviar";
import Modal from "@/components/Modal";
import { Avatar, CabecalhoPagina, EstadoVazio } from "@/components/ui";
import { textoDoUltimoPedido, type FiltroClientes, type SituacaoCliente } from "@/lib/agencia/situacao-cliente";

export interface SeloCard {
  rotulo: string;
  tom: string;
}

export interface ClienteCard {
  id: string;
  nome: string;
  nicho: string | null;
  logo: string | null;
  situacao: SituacaoCliente;
  // Dias desde o último pedido. Nulo para quem nunca pediu.
  diasSemPedido: number | null;
  saldo: number;
  aprovadasNoMes: number;
  temPedidoEmAndamento: boolean;
  // Plano vencendo ou vencido e pagamento em aberto. Vazio para o colaborador.
  cobranca: SeloCard[];
}

const SELO_SITUACAO: Partial<Record<SituacaoCliente, SeloCard>> = {
  inativo: { rotulo: "Inativo", tom: "badge-warning" },
  em_teste: { rotulo: "Em teste", tom: "badge-accent" },
  arquivado: { rotulo: "Arquivado", tom: "" },
};

const ROTULO_FILTRO: Record<FiltroClientes, string> = {
  todos: "Todos",
  ativos: "Ativos",
  inativos: "Inativos",
  em_teste: "Em teste",
  em_producao: "Em produção",
  sem_credito: "Sem crédito",
  arquivados: "Arquivados",
};

// Some da fila de chips quando não tem ninguém, a não ser que esteja escolhido.
const SO_COM_CLIENTES: FiltroClientes[] = ["em_teste", "arquivados"];

function passaNoFiltro(c: ClienteCard, filtro: FiltroClientes): boolean {
  // Arquivado só aparece em "Arquivados": cliente que saiu não ocupa a grade de
  // quem está sendo atendido hoje.
  if (filtro === "arquivados") return c.situacao === "arquivado";
  if (c.situacao === "arquivado") return false;
  switch (filtro) {
    case "ativos":
      return c.situacao === "ativo";
    case "inativos":
      return c.situacao === "inativo";
    case "em_teste":
      return c.situacao === "em_teste";
    case "em_producao":
      return c.temPedidoEmAndamento;
    case "sem_credito":
      // Cliente em teste não usa crédito: ficar sem não trava nada.
      return c.situacao !== "em_teste" && c.saldo === 0;
    default:
      return true;
  }
}

// Lista de clientes pensada para escala: com 20, 50 ou 100 empresas, o que
// importa é achar rápido e enxergar quem precisa de atenção. Por isso cards
// compactos, busca no topo e o cadastro escondido atrás de um botão — criar
// cliente é eventual, achar cliente é o tempo todo.
export default function ListaClientes({
  clientes,
  filtroInicial = "todos",
}: {
  clientes: ClienteCard[];
  filtroInicial?: FiltroClientes;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroClientes>(filtroInicial);
  const [formAberto, setFormAberto] = useState(false);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (!passaNoFiltro(c, filtro)) return false;
      if (!termo) return true;
      return c.nome.toLowerCase().includes(termo) || (c.nicho ?? "").toLowerCase().includes(termo);
    });
  }, [clientes, busca, filtro]);

  const contagem = useMemo(() => {
    const n = {} as Record<FiltroClientes, number>;
    for (const f of Object.keys(ROTULO_FILTRO) as FiltroClientes[]) {
      n[f] = clientes.filter((c) => passaNoFiltro(c, f)).length;
    }
    return n;
  }, [clientes]);

  // O endereço guarda o filtro: recarregar ou voltar não perde a lista que estava aberta.
  function escolherFiltro(novo: FiltroClientes) {
    setFiltro(novo);
    window.history.replaceState(null, "", novo === "todos" ? "/clientes" : `/clientes?filtro=${novo}`);
  }

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
        descricao="Cada cliente guarda a própria identidade visual, os materiais e os créditos."
        acoes={botaoNovo}
      />

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 lg:max-w-sm">
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
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrar clientes">
          {(Object.keys(ROTULO_FILTRO) as FiltroClientes[])
            .filter((f) => !SO_COM_CLIENTES.includes(f) || contagem[f] > 0 || f === filtro)
            .map((f) => (
              <Chip key={f} ativo={filtro === f} onClick={() => escolherFiltro(f)}>
                {ROTULO_FILTRO[f]} <Contagem>{contagem[f]}</Contagem>
              </Chip>
            ))}
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
            <label className="flex flex-col">
              <span className="label">Sobre a empresa</span>
              <textarea
                name="observacoes"
                className="input min-h-[76px] resize-y"
                placeholder="O que ela faz, para quem e como a pessoa compra. A IA lê isto antes de criar qualquer arte."
              />
            </label>
            <BotaoEnviar className="btn btn-primary self-end">Cadastrar</BotaoEnviar>
          </form>
        </Modal>
      )}

      {visiveis.length === 0 ? (
        <div className="card">
          {contagem.todos === 0 && filtro === "todos" && !busca ? (
            <EstadoVazio
              icone={Store}
              titulo="Nenhum cliente ativo"
              descricao="Cadastre a primeira empresa para começar a produzir."
              acao={botaoNovo}
            />
          ) : (
            <EstadoVazio icone={SearchX} titulo="Nada encontrado" descricao="Tente outro termo ou troque o filtro." />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,250px),1fr))] gap-3">
          {visiveis.map((c) => (
            <CardCliente key={c.id} cliente={c} />
          ))}
        </div>
      )}
    </>
  );
}

function CardCliente({ cliente: c }: { cliente: ClienteCard }) {
  const selo = SELO_SITUACAO[c.situacao];
  // Em teste não usa crédito; o selo "Em teste" já diz isso.
  const mostraCredito = c.situacao !== "em_teste";
  const linha = [
    textoDoUltimoPedido(c.diasSemPedido),
    c.aprovadasNoMes > 0 ? `${c.aprovadasNoMes} ${c.aprovadasNoMes === 1 ? "aprovada" : "aprovadas"} no mês` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link href={`/clientes/${c.id}`} className="card card-interactive p-3.5 flex flex-col gap-3 min-w-0">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar nome={c.nome} src={c.logo} tamanho={40} />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm leading-snug truncate" title={c.nome}>
            {c.nome}
          </p>
          <p className="text-xs text-[var(--muted)] truncate">{c.nicho ?? "sem nicho"}</p>
        </div>
        {selo && <span className={`badge ${selo.tom} shrink-0`}>{selo.rotulo}</span>}
      </div>
      {(mostraCredito || c.temPedidoEmAndamento || c.cobranca.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {mostraCredito && (
            <span className={`badge ${c.saldo === 0 ? "badge-danger" : ""}`}>
              {c.saldo === 0 ? "Sem crédito" : `${c.saldo} ${c.saldo === 1 ? "crédito" : "créditos"}`}
            </span>
          )}
          {c.temPedidoEmAndamento && <span className="badge badge-accent">Em produção</span>}
          {c.cobranca.map((s) => (
            <span key={s.rotulo} className={`badge ${s.tom}`}>
              {s.rotulo}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-[var(--muted)] truncate -mt-1" title={linha}>
        {linha}
      </p>
    </Link>
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
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`${ativo ? "chip chip-selected" : "chip"} shrink-0`}
    >
      {children}
    </button>
  );
}

function Contagem({ children }: { children: React.ReactNode }) {
  return <span className="opacity-60 tabular-nums">{children}</span>;
}
