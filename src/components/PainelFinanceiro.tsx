import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Scale,
  Trash2,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { removerGasto } from "@/app/(app)/financeiro/actions";
import BotaoConfirmar from "@/components/BotaoConfirmar";
import LancarGasto from "@/components/LancarGasto";
import { CabecalhoPagina, EstadoVazio, TituloCard } from "@/components/ui";
import {
  CATEGORIAS_GASTO,
  SALDO_OPENAI_BAIXO_USD,
  gastosPorCategoria,
  resumoDoCaixa,
  type CategoriaGasto,
  type Entrada,
  type Gasto,
  type MesFinanceiro,
  type SaldoOpenAI,
} from "@/lib/agencia/financeiro";
import { centavosParaBRL, formatarUSD, rotuloDoMetodo } from "@/lib/agencia/types";
import { formatarDia } from "@/lib/datas";

// O caixa da agência: o dinheiro que entrou (pagamentos confirmados dos clientes)
// e o que saiu (gastos lançados aqui). O Painel mostra outra coisa, o custo de
// geração de cada arte, que já está dentro das recargas da OpenAI: os dois nunca
// se somam. Só desenha: quem lê o banco é a página do Financeiro.

const CATEGORIAS = Object.keys(CATEGORIAS_GASTO) as CategoriaGasto[];

type Lancamento = { tipo: "entrada"; dia: string; entrada: Entrada } | { tipo: "gasto"; dia: string; gasto: Gasto };

export default function PainelFinanceiro({
  mes,
  hoje,
  entradas,
  gastos,
  saldo,
}: {
  mes: MesFinanceiro;
  hoje: string;
  // De todos os meses: o resumo do mês, o do ano e o "Desde o início" saem daqui.
  entradas: Entrada[];
  gastos: Gasto[];
  // Nulo quando não deu para ler agora.
  saldo: SaldoOpenAI | null;
}) {
  const doMes = resumoDoCaixa(entradas, gastos, mes.inicio, mes.fim);
  const desdeOInicio = resumoDoCaixa(entradas, gastos);
  const categoriasMes = gastosPorCategoria(gastos, mes.inicio, mes.fim);
  const categoriasAno = gastosPorCategoria(gastos, `${mes.ano}-01-01`, `${mes.ano}-12-31`);
  const recargasCentavos = gastos.filter((g) => g.categoria === "openai").reduce((s, g) => s + g.valor_centavos, 0);

  const noMes = (dia: string) => dia >= mes.inicio && dia <= mes.fim;
  const gastosDoMes = gastos.filter((g) => noMes(g.dia));
  const extrato: Lancamento[] = [
    ...gastosDoMes.map((g) => ({ tipo: "gasto" as const, dia: g.dia, gasto: g })),
    ...entradas.filter((e) => noMes(e.dia)).map((e) => ({ tipo: "entrada" as const, dia: e.dia, entrada: e })),
  ].sort((a, b) => b.dia.localeCompare(a.dia));

  return (
    <main className="pagina flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Financeiro"
        descricao="O caixa da agência: o que entrou dos clientes e o que saiu."
        acoes={
          <>
            <NavegacaoDoMes rotulo={mes.rotulo} anterior={mes.anterior} seguinte={mes.seguinte} />
            <LancarGasto hoje={hoje} mesAberto={mes.chave} />
          </>
        }
      />

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4" aria-label="Resumo do mês">
        <Indicador
          titulo="Entrou"
          icone={ArrowDownLeft}
          valor={centavosParaBRL(doMes.entrouCentavos)}
          ajuda="Pagamentos confirmados no mês, sem os clientes em teste"
        />
        <Indicador
          titulo="Saiu"
          icone={ArrowUpRight}
          valor={centavosParaBRL(doMes.saiuCentavos)}
          ajuda={
            gastosDoMes.length === 0
              ? "Nenhum gasto lançado no mês"
              : `${gastosDoMes.length} ${gastosDoMes.length === 1 ? "gasto lançado" : "gastos lançados"} no mês`
          }
        />
        <Indicador
          titulo="Resultado"
          icone={Scale}
          valor={centavosParaBRL(doMes.resultadoCentavos)}
          ajuda="O que entrou menos o que saiu"
          tom={doMes.resultadoCentavos < 0 ? "perigo" : doMes.resultadoCentavos > 0 ? "ok" : undefined}
        />
        <IndicadorSaldo saldo={saldo} />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 lg:gap-4 items-start">
        <section className="card p-5 flex flex-col gap-3 xl:col-span-2" aria-labelledby="titulo-extrato">
          <TituloCard
            titulo={<span id="titulo-extrato">Extrato de {mes.rotulo}</span>}
            descricao="Do mais recente para o mais antigo. Só os gastos se removem aqui; um pagamento se corrige na página do cliente."
          />
          {extrato.length === 0 ? (
            <EstadoVazio
              icone={Wallet}
              titulo="Nada neste mês"
              descricao="Os pagamentos confirmados dos clientes e os gastos lançados aparecem aqui."
            />
          ) : (
            <ul className="flex flex-col -mx-5">
              {extrato.map((l) =>
                l.tipo === "entrada" ? (
                  <LinhaEntrada key={`e-${l.entrada.id}`} entrada={l.entrada} />
                ) : (
                  <LinhaGasto key={`g-${l.gasto.id}`} gasto={l.gasto} />
                ),
              )}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-3 lg:gap-4">
          <CartaoOpenAI saldo={saldo} recargasCentavos={recargasCentavos} />

          <section className="card p-5 flex flex-col gap-3" aria-labelledby="titulo-categorias">
            <TituloCard
              titulo={<span id="titulo-categorias">Saídas por categoria</span>}
              descricao={`No mês aberto e em ${mes.ano} inteiro.`}
            />
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="text-[13px] text-[var(--muted)]">
                  <th scope="col" className="py-1.5 text-left font-medium">
                    Categoria
                  </th>
                  <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                    No mês
                  </th>
                  <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                    Em {mes.ano}
                  </th>
                </tr>
              </thead>
              <tbody>
                {CATEGORIAS.map((c) => (
                  <tr key={c} className="border-t border-[var(--border)]">
                    <th scope="row" className="py-2 text-left font-normal">
                      {CATEGORIAS_GASTO[c]}
                    </th>
                    <td className="py-2 pl-3 text-right">
                      <Valor centavos={categoriasMes[c]} />
                    </td>
                    <td className="py-2 pl-3 text-right">
                      <Valor centavos={categoriasAno[c]} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border-strong)] font-semibold">
                  <th scope="row" className="py-2 text-left">
                    Total
                  </th>
                  <td className="py-2 pl-3 text-right">{centavosParaBRL(soma(categoriasMes))}</td>
                  <td className="py-2 pl-3 text-right">{centavosParaBRL(soma(categoriasAno))}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section className="card p-5 flex flex-col gap-3" aria-labelledby="titulo-inicio">
            <TituloCard
              titulo={<span id="titulo-inicio">Desde o início</span>}
              descricao="Todo o caixa lançado no app, de todos os meses."
            />
            <dl className="flex flex-col text-sm tabular-nums">
              <LinhaResumo rotulo="Entrou" valor={centavosParaBRL(desdeOInicio.entrouCentavos)} />
              <LinhaResumo rotulo="Saiu" valor={centavosParaBRL(desdeOInicio.saiuCentavos)} />
              <LinhaResumo
                rotulo="Resultado"
                valor={centavosParaBRL(desdeOInicio.resultadoCentavos)}
                forte
                tom={desdeOInicio.resultadoCentavos < 0 ? "perigo" : undefined}
              />
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}

const soma = (valores: Record<string, number>) => Object.values(valores).reduce((s, v) => s + v, 0);

function NavegacaoDoMes({ rotulo, anterior, seguinte }: { rotulo: string; anterior: string; seguinte: string | null }) {
  return (
    <nav aria-label="Mês" className="flex items-center gap-1">
      <Link href={`/financeiro?mes=${anterior}`} className="btn btn-ghost btn-icone" aria-label="Mês anterior">
        <ChevronLeft size={16} aria-hidden="true" />
      </Link>
      <span className="text-sm font-medium min-w-[9.5rem] text-center first-letter:uppercase inline-block">
        {rotulo}
      </span>
      {seguinte ? (
        <Link href={`/financeiro?mes=${seguinte}`} className="btn btn-ghost btn-icone" aria-label="Mês seguinte">
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      ) : (
        <span className="btn btn-ghost btn-icone opacity-35 pointer-events-none" aria-hidden="true">
          <ChevronRight size={16} />
        </span>
      )}
    </nav>
  );
}

// No celular a data e o ícone saem da linha (a data vai para a linha de baixo):
// com eles, sobravam uns 50px para o nome.
function LinhaEntrada({ entrada: e }: { entrada: Entrada }) {
  return (
    <li className="flex items-center gap-2 sm:gap-3 px-5 py-2.5 border-t border-[var(--border)]">
      <Dia dia={e.dia} />
      <IconeLancamento icone={ArrowDownLeft} entrada />
      <div className="min-w-0 flex-1">
        <Link href={`/clientes/${e.clienteId}#plano`} className="block text-sm font-medium truncate hover:underline">
          {e.cliente}
        </Link>
        <p className="text-xs text-[var(--muted)] truncate">
          <DiaNoCelular dia={e.dia} />
          {e.descricao} · {rotuloDoMetodo(e.metodo)}
        </p>
      </div>
      <span className="text-sm font-semibold tabular-nums whitespace-nowrap text-[var(--success)]">
        + {centavosParaBRL(e.valorCentavos)}
      </span>
      {/* O lugar do botão de remover, para os valores ficarem alinhados. */}
      <span className="w-9 shrink-0" aria-hidden="true" />
    </li>
  );
}

function LinhaGasto({ gasto: g }: { gasto: Gasto }) {
  const detalhes = [g.descricao, g.credito_usd !== null && `${formatarUSD(g.credito_usd)} de crédito`].filter(Boolean);

  return (
    <li className="flex items-center gap-2 sm:gap-3 px-5 py-2.5 border-t border-[var(--border)]">
      <Dia dia={g.dia} />
      <IconeLancamento icone={ArrowUpRight} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{CATEGORIAS_GASTO[g.categoria] ?? "Gasto"}</p>
        <p className={`text-xs text-[var(--muted)] truncate ${detalhes.length === 0 ? "sm:hidden" : ""}`}>
          <DiaNoCelular dia={g.dia} separador={detalhes.length > 0} />
          {detalhes.join(" · ")}
        </p>
      </div>
      <span className="text-sm font-semibold tabular-nums whitespace-nowrap">− {centavosParaBRL(g.valor_centavos)}</span>
      <form action={removerGasto} className="shrink-0">
        <input type="hidden" name="id" value={g.id} />
        <BotaoConfirmar
          pergunta={`Remover o gasto de ${centavosParaBRL(g.valor_centavos)} em ${formatarDia(g.dia)}? Não dá para desfazer.`}
          className="btn btn-ghost btn-icone text-[var(--muted)] hover:text-[var(--danger)]"
        >
          <Trash2 size={15} aria-hidden="true" />
          <span className="sr-only">Remover gasto</span>
        </BotaoConfirmar>
      </form>
    </li>
  );
}

function Dia({ dia }: { dia: string }) {
  return (
    <time dateTime={dia} className="hidden sm:block w-11 shrink-0 text-[13px] text-[var(--muted)] tabular-nums">
      {formatarDia(dia).slice(0, 5)}
    </time>
  );
}

// A mesma data, no começo da linha de baixo, só no celular.
function DiaNoCelular({ dia, separador = true }: { dia: string; separador?: boolean }) {
  return (
    <time dateTime={dia} className="sm:hidden tabular-nums">
      {formatarDia(dia).slice(0, 5)}
      {separador && <span aria-hidden="true"> · </span>}
    </time>
  );
}

function IconeLancamento({ icone: Icone, entrada = false }: { icone: LucideIcon; entrada?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`hidden sm:flex items-center justify-center w-7 h-7 rounded-full shrink-0 bg-[var(--surface-muted)] ${
        entrada ? "text-[var(--success)]" : "text-[var(--muted)]"
      }`}
    >
      <Icone size={14} />
    </span>
  );
}

function Valor({ centavos }: { centavos: number }) {
  return centavos > 0 ? <>{centavosParaBRL(centavos)}</> : <span className="text-[var(--muted)]">—</span>;
}

function LinhaResumo({
  rotulo,
  valor,
  forte = false,
  tom,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
  tom?: "perigo" | "alerta";
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 py-2 border-t first:border-t-0 ${
        forte ? "border-[var(--border-strong)] font-semibold" : "border-[var(--border)]"
      }`}
    >
      <dt className={forte ? "" : "text-[var(--muted)]"}>{rotulo}</dt>
      <dd
        className={
          tom === "perigo" ? "text-[var(--danger)]" : tom === "alerta" ? "text-[var(--warning)] font-semibold" : ""
        }
      >
        {valor}
      </dd>
    </div>
  );
}

function IndicadorSaldo({ saldo }: { saldo: SaldoOpenAI | null }) {
  if (!saldo) {
    return <Indicador titulo="Saldo da OpenAI" icone={CircleDollarSign} valor="—" ajuda="Não consegui calcular agora" />;
  }
  if (saldo.saldoUsd === null) {
    return (
      <Indicador
        titulo="Saldo da OpenAI"
        icone={CircleDollarSign}
        valor="—"
        ajuda="Lance as recargas com o crédito em dólar para ver o saldo"
      />
    );
  }
  return (
    <Indicador
      titulo="Saldo da OpenAI"
      icone={CircleDollarSign}
      valor={`≈ ${formatarUSD(saldo.saldoUsd)}`}
      ajuda={
        saldo.acabou
          ? "Pela conta do app, acabou. Recarregue antes de gerar"
          : saldo.baixo
            ? `Abaixo de ${formatarUSD(SALDO_OPENAI_BAIXO_USD)}. Hora de recarregar`
            : "Estimado agora, pelas gerações"
      }
      tom={saldo.acabou ? "perigo" : saldo.baixo ? "alerta" : undefined}
    />
  );
}

function CartaoOpenAI({ saldo, recargasCentavos }: { saldo: SaldoOpenAI | null; recargasCentavos: number }) {
  return (
    <section className="card p-5 flex flex-col gap-3" aria-labelledby="titulo-openai">
      <TituloCard
        titulo={<span id="titulo-openai">OpenAI</span>}
        descricao="Créditos das recargas menos o que as gerações já gastaram, desde o começo."
      />
      {saldo === null ? (
        <p className="text-sm text-[var(--muted)]">Não consegui calcular o saldo agora. Recarregue a página.</p>
      ) : (
        <>
          <dl className="flex flex-col text-sm tabular-nums">
            <LinhaResumo rotulo="Créditos lançados" valor={formatarUSD(saldo.creditoUsd)} />
            <LinhaResumo rotulo="Gasto em gerações" valor={`− ${formatarUSD(saldo.gastoUsd)}`} />
            <LinhaResumo
              rotulo="Saldo estimado"
              valor={saldo.saldoUsd === null ? "—" : `≈ ${formatarUSD(saldo.saldoUsd)}`}
              forte
              tom={saldo.acabou ? "perigo" : saldo.baixo ? "alerta" : undefined}
            />
          </dl>
          {saldo.saldoUsd === null ? (
            <p className="text-[13px] text-[var(--muted)]">
              Nenhuma recarga tem o crédito em dólar ainda. Lance todas, as antigas também, com o valor que entrou
              lá: o gasto das gerações conta desde o começo.
            </p>
          ) : saldo.acabou ? (
            <p role="alert" className="text-[13px] text-[var(--danger)]">
              Pela conta do app o crédito acabou e as gerações vão falhar. Recarregue e lance a recarga aqui.
            </p>
          ) : saldo.baixo ? (
            <p className="text-[13px] text-[var(--warning)]">Está acabando. Recarregue antes que as gerações parem.</p>
          ) : null}
        </>
      )}
      <p className="text-[13px] text-[var(--muted)] border-t border-[var(--border)] pt-3">
        Recargas desde o início:{" "}
        <span className="font-medium text-[var(--foreground)]">{centavosParaBRL(recargasCentavos)}</span>. O custo de
        geração do Painel já está dentro delas: não some os dois.
      </p>
    </section>
  );
}

function Indicador({
  titulo,
  icone: Icone,
  valor,
  ajuda,
  tom,
}: {
  titulo: string;
  icone: LucideIcon;
  valor: string;
  ajuda: string;
  tom?: "ok" | "alerta" | "perigo";
}) {
  const cor =
    tom === "perigo"
      ? "text-[var(--danger)]"
      : tom === "alerta"
        ? "text-[var(--warning)]"
        : tom === "ok"
          ? "text-[var(--success)]"
          : "";
  return (
    <div className="card indicador p-4 lg:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-[var(--muted)]">{titulo}</p>
        <Icone size={16} className="text-[var(--muted)] shrink-0" aria-hidden="true" />
      </div>
      <p className={`valor-indicador font-semibold tracking-tight mt-2 truncate tabular-nums ${cor}`}>{valor}</p>
      <p className="text-xs text-[var(--muted)] mt-1.5">{ajuda}</p>
    </div>
  );
}
