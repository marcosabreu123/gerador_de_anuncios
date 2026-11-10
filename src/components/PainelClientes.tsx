"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, Wallet } from "lucide-react";
import { confirmarPagamento } from "@/app/(app)/clientes/actions";
import BotaoEnviar from "@/components/BotaoEnviar";
import FormNovoCliente from "@/components/FormNovoCliente";
import Modal from "@/components/Modal";
import { Avatar, CabecalhoPagina, EstadoVazio, LegendaSituacao, PontoSituacao, TituloCard } from "@/components/ui";
import { formatarDia } from "@/lib/datas";
import {
  FILTROS_CLIENTES,
  JANELAS_VENCIMENTO,
  JANELA_PADRAO,
  SELO_SITUACAO,
  prazoDoPlano,
  precisaAtencao,
  situacaoDoPlano,
  type FiltroClientes,
  type LinhaCobranca,
  type SituacaoPlano,
} from "@/lib/agencia/cobrancas";
import { ROTULO_SITUACAO, textoDoUltimoPedido } from "@/lib/agencia/situacao-cliente";
import { centavosParaBRL, rotuloDoMetodo, type StatusPagamento } from "@/lib/agencia/types";

const ROTULO_FILTRO: Record<FiltroClientes, string> = {
  todos: "Todos",
  vencendo: "Vencendo",
  vencidos: "Vencidos",
  pendentes: "Pagamento pendente",
  sem_plano: "Sem plano",
  em_dia: "Em dia",
  em_teste: "Em teste",
  inativos: "Inativos",
  arquivados: "Arquivados",
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

type Linha = LinhaCobranca & { cobranca: SituacaoPlano };

function passaNoFiltro(l: Linha, filtro: FiltroClientes): boolean {
  // Arquivado só aparece em "Arquivados": cliente que saiu não ocupa a carteira de hoje.
  if (filtro === "arquivados") return l.situacao === "arquivado";
  if (l.situacao === "arquivado") return false;
  if (filtro === "todos") return true;
  if (filtro === "em_teste") return l.emTeste;
  if (filtro === "inativos") return l.situacao === "inativo";
  // Os filtros de cobrança são de quem paga: cliente em teste não é cobrado.
  if (l.emTeste) return false;
  switch (filtro) {
    case "vencendo":
      return l.cobranca === "vencendo";
    case "vencidos":
      return l.cobranca === "vencido";
    case "pendentes":
      return l.pagamento === "pendente";
    case "sem_plano":
      return l.cobranca === "sem_plano";
    case "em_dia":
      return l.cobranca === "em_dia";
  }
}

// A carteira inteira numa tela: a situação de cada cliente, o plano, quem vence,
// quem venceu e quem deve. A janela de "vencendo" muda na hora, sem ir ao
// servidor, porque os dias até o vencimento já vêm calculados.
export default function PainelClientes({
  linhas,
  historico,
  recebidoNoMesCentavos,
  mes,
  filtroInicial,
  cadastroAberto,
  hoje,
  precos,
}: {
  linhas: LinhaCobranca[];
  historico: PagamentoDaLista[];
  recebidoNoMesCentavos: number;
  mes: string;
  filtroInicial: FiltroClientes;
  // A Produção manda para cá com ?novo=1: o cadastro abre direto.
  cadastroAberto: boolean;
  hoje: string;
  precos: Record<string, number>;
}) {
  const [filtro, setFiltro] = useState<FiltroClientes>(filtroInicial);
  const [janela, setJanela] = useState<number>(JANELA_PADRAO);
  const [formAberto, setFormAberto] = useState(cadastroAberto);

  const comPlano = useMemo<Linha[]>(
    () => linhas.map((l) => ({ ...l, cobranca: situacaoDoPlano(l.dias, janela) })),
    [linhas, janela],
  );
  const visiveis = comPlano.filter((l) => passaNoFiltro(l, filtro));
  const contagem = Object.fromEntries(
    FILTROS_CLIENTES.map((f) => [f, comPlano.filter((l) => passaNoFiltro(l, f)).length]),
  ) as Record<FiltroClientes, number>;

  const naCarteira = linhas.filter((l) => l.situacao !== "arquivado");
  const pagantes = naCarteira.filter((l) => !l.emTeste).length;
  const atencao = naCarteira.filter((l) => precisaAtencao(l, janela)).length;
  const aReceber = linhas.reduce((soma, l) => soma + l.aReceberCentavos, 0);
  const pagamentosAbertos = historico.filter((p) => p.status === "pendente").length;

  // O endereço guarda o filtro: recarregar ou voltar não perde a lista que estava aberta.
  function escolherFiltro(novo: FiltroClientes) {
    setFiltro(novo);
    window.history.replaceState(null, "", novo === "todos" ? "/clientes" : `/clientes?filtro=${novo}`);
  }

  function fecharCadastro() {
    setFormAberto(false);
    // Sem isto, recarregar a página com ?novo=1 abriria o cadastro de novo.
    if (cadastroAberto) window.history.replaceState(null, "", filtro === "todos" ? "/clientes" : `/clientes?filtro=${filtro}`);
  }

  const botaoNovo = (
    <button type="button" onClick={() => setFormAberto(true)} className="btn btn-primary">
      <Plus size={16} aria-hidden="true" />
      Novo cliente
    </button>
  );

  // Só os filtros que têm alguém, mais o escolhido: com todos em teste, a fila de
  // chips não vira uma lista de zeros.
  const filtrosVisiveis = FILTROS_CLIENTES.filter((f) => f === "todos" || f === filtro || contagem[f] > 0);

  return (
    <>
      <CabecalhoPagina
        titulo="Clientes"
        descricao="A carteira: situação, plano, vencimento e pagamento de cada cliente."
        acoes={botaoNovo}
      />

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4" aria-label="Resumo da carteira">
        <Indicador
          titulo="Pagantes"
          valor={String(pagantes)}
          ajuda={
            naCarteira.length - pagantes > 0
              ? `${naCarteira.length - pagantes} em teste, fora da cobrança`
              : "Clientes com plano ou a cobrar"
          }
        />
        <Indicador
          titulo="Pedem atenção"
          valor={String(atencao)}
          ajuda={atencao > 0 ? "Plano vencido, vencendo, faltando ou pagamento em aberto" : "Nenhuma cobrança pendente"}
          tom={atencao > 0 ? "alerta" : undefined}
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

      {formAberto && (
        <Modal titulo="Novo cliente" aoFechar={fecharCadastro} largo>
          <FormNovoCliente hoje={hoje} precos={precos} />
        </Modal>
      )}

      <section className="card flex flex-col">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 p-4 lg:px-5">
          {/* No celular os filtros rolam de lado; no PC quebram linha, sem esconder nenhum. */}
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible min-w-0">
            {filtrosVisiveis.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => escolherFiltro(f)}
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

        {linhas.length > 0 && (
          <div className="px-4 lg:px-5 pb-3 -mt-1">
            <LegendaSituacao situacoes={["ativo", "inativo", "em_teste"]} />
          </div>
        )}

        {linhas.length === 0 ? (
          <EstadoVazio
            icone={Wallet}
            titulo="Nenhum cliente ainda"
            descricao="Cadastre a primeira empresa, com o plano ou em teste."
            acao={botaoNovo}
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
                  <th className="py-2.5 px-3 font-medium">Cobrança</th>
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
                      <SeloCobranca linha={l} />
                    </td>
                    <td className="py-3 px-3">
                      <Pagamento linha={l} />
                    </td>
                    <td className="py-3 px-3 text-right tabular-nums">
                      <Creditos linha={l} />
                    </td>
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
                    <SeloCobranca linha={l} />
                  </div>
                  {l.plano && (
                    <div className="grid grid-cols-2 gap-3">
                      <Plano linha={l} />
                      <Vencimento linha={l} />
                    </div>
                  )}
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
                    <Link href={`/clientes/${pg.clienteId}#plano`} className="font-medium hover:underline">
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
  const ultimo = textoDoUltimoPedido(linha.diasSemPedido);
  return (
    <Link
      href={`/clientes/${linha.clienteId}#plano`}
      className="flex items-center gap-2.5 min-w-0 group"
      title={linha.nicho ?? undefined}
    >
      <Avatar nome={linha.nome} src={linha.logo} tamanho={32} />
      <span className="min-w-0">
        <span className="flex items-center gap-2 min-w-0">
          <PontoSituacao situacao={linha.situacao} dica={`${ROTULO_SITUACAO[linha.situacao]}. ${ultimo}.`} />
          <span className="font-medium text-sm truncate group-hover:underline">{linha.nome}</span>
        </span>
        <span className="block text-xs text-[var(--muted)] truncate">{ultimo}</span>
      </span>
    </Link>
  );
}

function SeloCobranca({ linha }: { linha: Linha }) {
  if (linha.situacao === "arquivado") return <span className="badge">Arquivado</span>;
  if (linha.emTeste) {
    return (
      <span className="badge badge-accent" title="Não paga nem usa crédito">
        Em teste
      </span>
    );
  }
  return <span className={`badge ${SELO_SITUACAO[linha.cobranca].tom}`}>{SELO_SITUACAO[linha.cobranca].rotulo}</span>;
}

function Plano({ linha }: { linha: Linha }) {
  if (!linha.plano) return <span className="text-[13px] text-[var(--muted)]">—</span>;
  return (
    <div className="min-w-0">
      <p className="text-sm">{linha.plano.nome}</p>
      <p className="text-xs text-[var(--muted)] mt-0.5">Contratado em {formatarDia(linha.plano.assinadoEm)}</p>
    </div>
  );
}

function Vencimento({ linha }: { linha: Linha }) {
  if (!linha.plano || linha.dias === null) return <span className="text-[13px] text-[var(--muted)]">—</span>;
  const cor =
    linha.cobranca === "vencido"
      ? "text-[var(--danger)] font-medium"
      : linha.cobranca === "vencendo"
        ? "text-[var(--warning)] font-medium"
        : "text-[var(--muted)]";
  return (
    <div>
      <p className="text-sm tabular-nums">{formatarDia(linha.plano.venceEm)}</p>
      <p className={`text-xs mt-0.5 ${cor}`}>{prazoDoPlano(linha.dias)}</p>
    </div>
  );
}

// Situação do pagamento com o valor ao lado: o que falta receber, ou o que o
// plano pago custou.
function Pagamento({ linha }: { linha: Linha }) {
  if (linha.pagamento === "sem_registro") return <span className="text-[13px] text-[var(--muted)]">—</span>;
  const pendente = linha.pagamento === "pendente";
  const valor = pendente ? linha.aReceberCentavos : linha.pagoCentavos;
  return (
    <span className="flex items-center gap-2">
      <span className={`badge ${pendente ? "badge-warning" : "badge-success"}`}>{pendente ? "Pendente" : "Pago"}</span>
      {valor !== null && <span className="text-[13px] tabular-nums">{centavosParaBRL(valor)}</span>}
    </span>
  );
}

function Creditos({ linha }: { linha: Linha }) {
  // Cliente em teste não usa crédito: o saldo dele não diz nada.
  if (linha.emTeste) {
    return (
      <span className="text-[var(--muted)]" title="Cliente em teste não usa crédito">
        —
      </span>
    );
  }
  return <>{linha.imagens}</>;
}

// Uma ação por linha, a que destrava o resto: com pagamento em aberto, receber
// vem antes de renovar. O que sobra fica na página do cliente.
function Acao({ linha }: { linha: Linha }) {
  if (linha.situacao === "arquivado") return null;
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
      <Link href={`/clientes/${linha.clienteId}?renovar=${linha.plano.id}#plano`} className="btn btn-outline btn-sm">
        <RefreshCw size={14} aria-hidden="true" />
        Renovar
      </Link>
    );
  }
  // Para quem paga, criar o plano é a pendência. Para o teste, é o caminho para
  // começar a pagar: registrar o primeiro plano tira o cliente do teste.
  return (
    <Link
      href={`/clientes/${linha.clienteId}#plano`}
      className={`btn btn-sm whitespace-nowrap ${linha.emTeste ? "btn-ghost" : "btn-outline"}`}
      title={linha.emTeste ? "Registrar o primeiro plano tira o cliente do teste" : undefined}
    >
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
    <div className="card indicador p-4 lg:p-5 min-w-0">
      <p className="text-[13px] text-[var(--muted)]">{titulo}</p>
      <p
        className={`valor-indicador font-semibold tracking-tight mt-1.5 truncate tabular-nums ${
          tom === "perigo" ? "text-[var(--danger)]" : tom === "alerta" ? "text-[var(--warning)]" : ""
        }`}
      >
        {valor}
      </p>
      <p className="text-xs text-[var(--muted)] mt-1.5">{ajuda}</p>
    </div>
  );
}
