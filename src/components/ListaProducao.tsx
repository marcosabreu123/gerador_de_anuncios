"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Search, SearchX, Store } from "lucide-react";
import { Avatar, CabecalhoPagina, EstadoVazio } from "@/components/ui";
import { textoDoUltimoPedido, type FiltroProducao, type SituacaoCliente } from "@/lib/agencia/situacao-cliente";

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
  // Artes prontas esperando aprovação.
  paraAprovar: number;
  temPedidoEmAndamento: boolean;
  // Plano vencendo, vencido ou faltando, e pagamento em aberto. Vazio para o colaborador.
  cobranca: SeloCard[];
}

const SELO_SITUACAO: Partial<Record<SituacaoCliente, SeloCard>> = {
  inativo: { rotulo: "Inativo", tom: "badge-warning" },
  em_teste: { rotulo: "Em teste", tom: "badge-accent" },
  arquivado: { rotulo: "Arquivado", tom: "" },
};

const ROTULO_FILTRO: Record<FiltroProducao, string> = {
  todos: "Todos",
  em_producao: "Em produção",
  para_aprovar: "Para aprovar",
  sem_credito: "Sem crédito",
  em_teste: "Em teste",
  arquivados: "Arquivados",
};

// Some da fila de chips quando não tem ninguém, a não ser que esteja escolhido.
const SO_COM_CLIENTES: FiltroProducao[] = ["em_teste", "arquivados"];

function passaNoFiltro(c: ClienteCard, filtro: FiltroProducao): boolean {
  // Arquivado só aparece em "Arquivados": cliente que saiu não ocupa a grade de
  // quem está sendo atendido hoje.
  if (filtro === "arquivados") return c.situacao === "arquivado";
  if (c.situacao === "arquivado") return false;
  switch (filtro) {
    case "em_producao":
      return c.temPedidoEmAndamento;
    case "para_aprovar":
      return c.paraAprovar > 0;
    case "sem_credito":
      // Cliente em teste não usa crédito: ficar sem não trava nada.
      return c.situacao !== "em_teste" && c.saldo === 0;
    case "em_teste":
      return c.situacao === "em_teste";
    default:
      return true;
  }
}

// A Produção pensada para escala: com 20, 50 ou 100 empresas, o que importa é
// achar rápido e enxergar o que espera alguém. Por isso cards compactos, busca no
// topo e atalhos para o que está em produção ou pronto para aprovar. Cadastrar
// cliente fica na aba Clientes, com o plano.
export default function ListaProducao({
  clientes,
  filtroInicial = "todos",
  podeCadastrar,
}: {
  clientes: ClienteCard[];
  filtroInicial?: FiltroProducao;
  // Só o sócio cadastra: o cadastro já pede o plano ou o teste.
  podeCadastrar: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroProducao>(filtroInicial);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      if (!passaNoFiltro(c, filtro)) return false;
      if (!termo) return true;
      return c.nome.toLowerCase().includes(termo) || (c.nicho ?? "").toLowerCase().includes(termo);
    });
  }, [clientes, busca, filtro]);

  const contagem = useMemo(() => {
    const n = {} as Record<FiltroProducao, number>;
    for (const f of Object.keys(ROTULO_FILTRO) as FiltroProducao[]) {
      n[f] = clientes.filter((c) => passaNoFiltro(c, f)).length;
    }
    return n;
  }, [clientes]);

  // O endereço guarda o filtro: recarregar ou voltar não perde a lista que estava aberta.
  function escolherFiltro(novo: FiltroProducao) {
    setFiltro(novo);
    window.history.replaceState(null, "", novo === "todos" ? "/producao" : `/producao?filtro=${novo}`);
  }

  const botaoNovo = podeCadastrar && (
    <Link href="/clientes?novo=1" className="btn btn-outline">
      <Plus size={16} aria-hidden="true" />
      Novo cliente
    </Link>
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Produção"
        descricao="Escolha o cliente para abrir um pedido ou aprovar as artes prontas."
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

        {/* Atalhos que respondem "o que espera alguém agora?". */}
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]" role="group" aria-label="Filtrar clientes">
          {(Object.keys(ROTULO_FILTRO) as FiltroProducao[])
            .filter((f) => !SO_COM_CLIENTES.includes(f) || contagem[f] > 0 || f === filtro)
            .map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => escolherFiltro(f)}
                aria-pressed={filtro === f}
                className={`${filtro === f ? "chip chip-selected" : "chip"} shrink-0`}
              >
                {ROTULO_FILTRO[f]} <span className="opacity-60 tabular-nums">{contagem[f]}</span>
              </button>
            ))}
        </div>
      </div>

      {visiveis.length === 0 ? (
        <div className="card">
          {contagem.todos === 0 && filtro === "todos" && !busca ? (
            <EstadoVazio
              icone={Store}
              titulo="Nenhum cliente ainda"
              descricao={
                podeCadastrar
                  ? "Cadastre a primeira empresa na aba Clientes, com o plano ou em teste."
                  : "Peça a um sócio para cadastrar a primeira empresa."
              }
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
      {(mostraCredito || c.temPedidoEmAndamento || c.paraAprovar > 0 || c.cobranca.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {c.paraAprovar > 0 && <span className="badge badge-accent">{c.paraAprovar} para aprovar</span>}
          {c.temPedidoEmAndamento && <span className="badge">Em produção</span>}
          {mostraCredito && (
            <span className={`badge ${c.saldo === 0 ? "badge-danger" : ""}`}>
              {c.saldo === 0 ? "Sem crédito" : `${c.saldo} ${c.saldo === 1 ? "crédito" : "créditos"}`}
            </span>
          )}
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
