"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Wallet } from "lucide-react";
import { confirmarPagamento } from "@/app/(app)/clientes/actions";
import BotaoEnviar from "@/components/BotaoEnviar";
import { Avatar, EstadoVazio, TituloCard } from "@/components/ui";
import { formatarDia } from "@/lib/datas";
import {
  FILTROS_COBRANCA,
  JANELAS_VENCIMENTO,
  JANELA_PADRAO,
  SELO_SITUACAO,
  prazoDoPlano,
  situacaoDoPlano,
  type FiltroCobranca,
  type LinhaCobranca,
  type SituacaoPlano,
} from "@/lib/agencia/cobrancas";
import { centavosParaBRL, rotuloDoMetodo, type StatusPagamento } from "@/lib/agencia/types";

const ROTULO_FILTRO: Record<FiltroCobranca, string> = {
  todos: "Todos",
  vencendo: "Vencendo",
  vencidos: "Vencidos",
  pendentes: "Pagamento pendente",
  pagos: "Pagos",
  em_dia: "Em dia",
  sem_plano: "Sem plano",
};

export interface PagamentoDaLista {
  id: string;
  clienteId: string;
  cliente: string;
  descricao: string;
  valorCentavos: number;
  metodo: string;
  status: StatusPagamento;
  // Dia em que foi pago; o do registro enquanto está em aberto.
  dia: string;
}

type Linha = LinhaCobranca & { situacao: SituacaoPlano };

function passaNoFiltro(l: Linha, filtro: FiltroCobranca): boolean {
  switch (filtro) {
    case "vencendo":
      return l.situacao === "vencendo";
    case "vencidos":
      return l.situacao === "vencido";
    case "pendentes":
      return l.pagamento === "pendente";
    case "pagos":
      return l.pagamento === "pago";
    case "em_dia":
      return l.situacao === "em_dia";
    case "sem_plano":
      return l.situacao === "sem_plano";
    default:
      return true;
  }
}

// A carteira inteira numa tela: quem vence, quem venceu, quem deve e quem está
// em dia. A janela de "vencendo" muda na hora, sem ir ao servidor, porque os
// dias até o vencimento já vêm calculados.
export default function PainelCobrancas({
  linhas,
  historico,
  recebidoNoMesCentavos,
  mes,
  filtroInicial,
}: {
  linhas: LinhaCobranca[];
  historico: PagamentoDaLista[];
  recebidoNoMesCentavos: number;
  mes: string;
  filtroInicial: FiltroCobranca;
}) {
  const [filtro, setFiltro] = useState<FiltroCobranca>(filtroInicial);
  const [janela, setJanela] = useState<number>(JANELA_PADRAO);

  const comSituacao = useMemo<Linha[]>(
    () => linhas.map((l) => ({ ...l, situacao: situacaoDoPlano(l.dias, janela) })),
    [linhas, janela],
  );
  const visiveis = comSituacao.filter((l) => passaNoFiltro(l, filtro));
  const contagem = Object.fromEntries(
    FILTROS_COBRANCA.map((f) => [f, comSituacao.filter((l) => passaNoFiltro(l, f)).length]),
  ) as Record<FiltroCobranca, number>;
  const aReceber = linhas.reduce((soma, l) => soma + l.aReceberCentavos, 0);
  const pagamentosAbertos = historico.filter((p) => p.status === "pendente").length;

  return (
    <>
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4" aria-label="Resumo das cobranças">
        <Indicador
          titulo="Vencendo"
          valor={String(contagem.vencendo)}
          ajuda={`Nos próximos ${janela} dias`}
          tom={contagem.vencendo > 0 ? "alerta" : undefined}
        />
        <Indicador
          titulo="Vencidos"
          valor={String(contagem.vencidos)}
          ajuda="Geração bloqueada até renovar"
          tom={contagem.vencidos > 0 ? "perigo" : undefined}
        />
        <Indicador
          titulo="A receber"
          valor={centavosParaBRL(aReceber)}
          ajuda={
            contagem.pendentes === 0
              ? "Nenhum pagamento em aberto"
              : `${contagem.pendentes} ${contagem.pendentes === 1 ? "cliente deve" : "clientes devem"}`
          }
        />
        <Indicador
          titulo="Recebido no mês"
          valor={centavosParaBRL(recebidoNoMesCentavos)}
          ajuda={<span className="first-letter:uppercase inline-block">{mes}</span>}
        />
      </section>

      <section className="card flex flex-col">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 p-4 lg:px-5">
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 lg:mx-0 lg:px-0">
            {FILTROS_COBRANCA.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                aria-pressed={filtro === f}
                className={filtro === f ? "chip chip-selected" : "chip"}
              >
                {ROTULO_FILTRO[f]} <span className="opacity-60 tabular-nums">{contagem[f]}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0" role="group" aria-label="Janela de vencimento">
            <span className="text-[13px] text-[var(--muted)]">Vencendo em até</span>
            {JANELAS_VENCIMENTO.map((dias) => (
              <button
                key={dias}
                type="button"
                onClick={() => setJanela(dias)}
                aria-pressed={janela === dias}
                className={janela === dias ? "chip chip-selected" : "chip"}
              >
                {dias} dias
              </button>
            ))}
          </div>
        </div>

        {linhas.length === 0 ? (
          <EstadoVazio
            icone={Wallet}
            titulo="Nenhum cliente ativo"
            descricao="Os clientes ativos aparecem aqui com o plano, o vencimento e o pagamento de cada um."
          />
        ) : visiveis.length === 0 ? (
          <p className="text-sm text-[var(--muted)] px-5 pb-6 pt-2">Nenhum cliente neste filtro.</p>
        ) : (
          <>
            {/* PC: tabela, para comparar vencimentos de cima a baixo. O nome fica
                com a sobra da largura e corta com reticências; o resto não quebra. */}
            <table className="hidden xl:table w-full text-sm">
              <thead>
                <tr className="text-left text-[13px] text-[var(--muted)] border-t border-[var(--border)] whitespace-nowrap">
                  <th className="py-2.5 pl-5 pr-3 font-medium w-full">Cliente</th>
                  <th className="py-2.5 px-3 font-medium">Plano</th>
                  <th className="py-2.5 px-3 font-medium">Vencimento</th>
                  <th className="py-2.5 px-3 font-medium">Situação</th>
                  <th className="py-2.5 px-3 font-medium">Pagamento</th>
                  <th className="py-2.5 px-3 font-medium text-right" title="Créditos disponíveis. Cada arte aprovada usa 1.">
                    Créditos
                  </th>
                  <th className="py-2.5 pr-5 pl-3">
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => (
                  <tr key={l.clienteId} className="border-t border-[var(--border)] align-middle whitespace-nowrap">
                    <td className="py-3 pl-5 pr-3 max-w-0">
                      <Cliente linha={l} />
                    </td>
                    <td className="py-3 px-3">
                      <Plano linha={l} />
                    </td>
                    <td className="py-3 px-3">
                      <Vencimento linha={l} />
                    </td>
                    <td className="py-3 px-3">
                      <span className={`badge ${SELO_SITUACAO[l.situacao].tom}`}>{SELO_SITUACAO[l.situacao].rotulo}</span>
                    </td>
                    <td className="py-3 px-3">
                      <Pagamento linha={l} />
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">{l.imagens}</td>
                    <td className="py-3 pr-5 pl-3 text-right">
                      <Acao linha={l} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Celular e tela estreita: um bloco por cliente. */}
            <ul className="xl:hidden flex flex-col">
              {visiveis.map((l) => (
                <li key={l.clienteId} className="flex flex-col gap-3 px-4 py-3.5 border-t border-[var(--border)]">
                  <div className="flex items-start justify-between gap-3">
                    <Cliente linha={l} />
                    <span className={`badge ${SELO_SITUACAO[l.situacao].tom}`}>{SELO_SITUACAO[l.situacao].rotulo}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Plano linha={l} />
                    <Vencimento linha={l} />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Pagamento linha={l} />
                    <Acao linha={l} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <TituloCard
          titulo="Pagamentos"
          descricao={
            pagamentosAbertos > 0
              ? `Os mais recentes primeiro. ${pagamentosAbertos} ${pagamentosAbertos === 1 ? "está" : "estão"} em aberto.`
              : "Os mais recentes primeiro."
          }
        />
        {historico.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="flex flex-col">
            {historico.map((pg) => (
              <li
                key={pg.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 border-t first:border-t-0 border-[var(--border)]"
              >
                <div className="flex items-baseline gap-3 min-w-0">
                  <span className="text-[13px] text-[var(--muted)] tabular-nums shrink-0">{formatarDia(pg.dia)}</span>
                  <span className="text-sm min-w-0">
                    <Link href={`/clientes/${pg.clienteId}#pacotes`} className="font-medium hover:underline">
                      {pg.cliente}
                    </Link>
                    <span className="text-[var(--muted)]"> · {pg.descricao}</span>
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-auto">
                  <span className="text-sm tabular-nums">
                    <span className="text-[var(--muted)]">{rotuloDoMetodo(pg.metodo)} · </span>
                    {centavosParaBRL(pg.valorCentavos)}
                  </span>
                  {pg.status === "pendente" ? (
                    <form action={confirmarPagamento}>
                      <input type="hidden" name="id" value={pg.id} />
                      <input type="hidden" name="cliente_id" value={pg.clienteId} />
                      <BotaoEnviar className="btn btn-outline btn-sm">Marcar como pago</BotaoEnviar>
                    </form>
                  ) : pg.status === "confirmado" ? (
                    <span className="badge badge-success">Pago</span>
                  ) : (
                    <span className="badge">Cancelado</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Cliente({ linha }: { linha: Linha }) {
  return (
    <Link href={`/clientes/${linha.clienteId}#pacotes`} className="flex items-center gap-2.5 min-w-0 group">
      <Avatar nome={linha.nome} src={linha.logo} tamanho={32} />
      <span className="min-w-0">
        <span className="block font-medium text-sm truncate group-hover:underline">{linha.nome}</span>
        <span className="block text-xs text-[var(--muted)] truncate">{linha.nicho ?? "sem nicho"}</span>
      </span>
    </Link>
  );
}

function Plano({ linha }: { linha: Linha }) {
  if (!linha.plano) {
    return <span className="text-[13px] text-[var(--muted)]">Sem plano por tempo</span>;
  }
  return (
    <div className="min-w-0">
      <p className="text-sm">{linha.plano.nome}</p>
      <p className="text-xs text-[var(--muted)] mt-0.5">Assinado em {formatarDia(linha.plano.assinadoEm)}</p>
    </div>
  );
}

function Vencimento({ linha }: { linha: Linha }) {
  if (!linha.plano || linha.dias === null) return <span className="text-[13px] text-[var(--muted)]">—</span>;
  const cor =
    linha.situacao === "vencido"
      ? "text-[var(--danger)] font-medium"
      : linha.situacao === "vencendo"
        ? "text-[var(--warning)] font-medium"
        : "text-[var(--muted)]";
  return (
    <div>
      <p className="text-sm tabular-nums">{formatarDia(linha.plano.venceEm)}</p>
      <p className={`text-xs mt-0.5 ${cor}`}>{prazoDoPlano(linha.dias)}</p>
    </div>
  );
}

// Situação do pagamento com o valor ao lado: o que falta receber, ou o que a
// venda paga custou (o plano, ou o último pacote avulso).
function Pagamento({ linha }: { linha: Linha }) {
  if (linha.pagamento === "sem_registro") return <span className="text-[13px] text-[var(--muted)]">—</span>;
  const pendente = linha.pagamento === "pendente";
  const valor = pendente ? linha.aReceberCentavos : linha.vendaPaga?.valorCentavos;
  return (
    <span
      className="flex items-center gap-2"
      title={!pendente && linha.vendaPaga?.tipo === "avulso" ? "Último pacote de créditos" : undefined}
    >
      <span className={`badge ${pendente ? "badge-warning" : "badge-success"}`}>{pendente ? "Pendente" : "Pago"}</span>
      {valor !== undefined && <span className="text-[13px] tabular-nums">{centavosParaBRL(valor)}</span>}
    </span>
  );
}

// Uma ação por linha, a que destrava o resto: com pagamento em aberto, receber
// vem antes de renovar. O que sobra fica na página do cliente.
function Acao({ linha }: { linha: Linha }) {
  if (linha.pendente) {
    return (
      <form action={confirmarPagamento} className="inline-flex">
        <input type="hidden" name="id" value={linha.pendente.id} />
        <input type="hidden" name="cliente_id" value={linha.clienteId} />
        <BotaoEnviar className="btn btn-outline btn-sm whitespace-nowrap">Marcar como pago</BotaoEnviar>
      </form>
    );
  }
  if (linha.plano) {
    return (
      <Link href={`/clientes/${linha.clienteId}?renovar=${linha.plano.id}#pacotes`} className="btn btn-outline btn-sm">
        <RefreshCw size={14} aria-hidden="true" />
        Renovar
      </Link>
    );
  }
  return (
    <Link href={`/clientes/${linha.clienteId}#pacotes`} className="btn btn-ghost btn-sm whitespace-nowrap">
      <Plus size={14} aria-hidden="true" />
      Criar plano
    </Link>
  );
}

function Indicador({
  titulo,
  valor,
  ajuda,
  tom,
}: {
  titulo: string;
  valor: string;
  ajuda: React.ReactNode;
  tom?: "alerta" | "perigo";
}) {
  return (
    <div className="card p-4 lg:p-5 min-w-0">
      <p className="text-[13px] text-[var(--muted)]">{titulo}</p>
      <p
        className={`text-2xl lg:text-[28px] font-semibold tracking-tight mt-1.5 truncate tabular-nums ${
          tom === "perigo" ? "text-[var(--danger)]" : tom === "alerta" ? "text-[var(--warning)]" : ""
        }`}
      >
        {valor}
      </p>
      <p className="text-xs text-[var(--muted)] mt-1.5">{ajuda}</p>
    </div>
  );
}
