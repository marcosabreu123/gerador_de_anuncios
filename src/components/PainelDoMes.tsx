import Link from "next/link";
import { BarChart3, Banknote, BadgeCheck, Receipt, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import GraficoProducao from "@/components/GraficoProducao";
import { Avatar, CabecalhoPagina, EstadoVazio, TituloCard } from "@/components/ui";
import { contarCarteira, totalizar, type ClienteNaCarteira, type RelatorioDoMes } from "@/lib/agencia/relatorio";
import { PACOTE_ENTRADA } from "@/lib/agencia/pacotes";
import { DIAS_PARA_INATIVO, type SituacaoCliente } from "@/lib/agencia/situacao-cliente";
import { formatarBRL, type ResumoCustoCliente } from "@/lib/agencia/types";

// Painel dos sócios: o resumo de tudo. Quanto o mês deu de receita, custo e
// margem, quantas artes foram aprovadas e como está a carteira de clientes. Só
// desenha: quem carrega os números é a página do painel.

const decimal = (valor: number) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const SITUACOES: { situacao: SituacaoCliente; rotulo: string; filtro: string }[] = [
  { situacao: "ativo", rotulo: "Ativos", filtro: "ativos" },
  { situacao: "inativo", rotulo: "Inativos", filtro: "inativos" },
  { situacao: "em_teste", rotulo: "Em teste", filtro: "em_teste" },
  { situacao: "arquivado", rotulo: "Arquivados", filtro: "arquivados" },
];

// Quantos clientes parados o painel lista. O resto está a um clique, no filtro.
const PARADOS_NO_PAINEL = 4;

const teveMovimento = (r: ResumoCustoCliente) =>
  r.geracoes > 0 || r.custo_brl > 0 || r.receita_brl > 0 || r.artes_aprovadas > 0 || r.aguardando_aprovacao > 0;

export default function PainelDoMes({
  resumos,
  producao,
  carteira,
  mes,
  hoje,
}: RelatorioDoMes & { mes: string; hoje: number }) {
  const totais = totalizar(resumos);
  const contagem = contarCarteira(carteira);

  const daAgencia = resumos.filter((r) => !r.em_teste && teveMovimento(r));
  const emTeste = resumos.filter((r) => r.em_teste && teveMovimento(r));

  // Quem nunca pediu vem primeiro: está parado desde o cadastro.
  const parados = carteira
    .filter((c) => c.situacao === "inativo")
    .sort((a, b) => (b.dias_sem_pedido ?? Infinity) - (a.dias_sem_pedido ?? Infinity));

  const prejuizo = totais.margem_brl < 0;
  const imagensPorArte = totais.artes_aprovadas > 0 ? totais.geracoes / totais.artes_aprovadas : 0;

  return (
    <main className="pagina flex flex-col gap-6">
      <CabecalhoPagina
        titulo="Painel do mês"
        descricao={<span className="first-letter:uppercase inline-block">{mes}</span>}
      />

      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4" aria-label="Resumo do mês">
        <Indicador
          titulo="Receita"
          icone={Banknote}
          valor={formatarBRL(totais.receita_brl)}
          ajuda="Pagamentos confirmados no mês"
        />
        <Indicador
          titulo="Custo de API"
          icone={Receipt}
          valor={formatarBRL(totais.custo_brl)}
          ajuda={
            totais.custo_em_teste_brl > 0
              ? `Inclui falhas. Clientes em teste: ${formatarBRL(totais.custo_em_teste_brl)} à parte`
              : "Inclui gerações que falharam"
          }
        />
        <Indicador
          titulo="Margem"
          icone={prejuizo ? TrendingDown : TrendingUp}
          valor={formatarBRL(totais.margem_brl)}
          ajuda="Receita menos custo de API, sem mão de obra"
          destaque={prejuizo ? "alerta" : totais.margem_brl > 0 ? "ok" : undefined}
        />
        <Indicador
          titulo="Artes aprovadas"
          icone={BadgeCheck}
          valor={String(totais.artes_aprovadas)}
          ajuda={
            totais.aguardando_aprovacao > 0
              ? `${totais.aguardando_aprovacao} ${
                  totais.aguardando_aprovacao === 1 ? "pronta" : "prontas"
                }, ainda sem aprovação`
              : "1 crédito por arte aprovada"
          }
        />
      </section>

      <section className="card p-5 flex flex-col gap-4" aria-labelledby="titulo-carteira">
        <TituloCard
          titulo={<span id="titulo-carteira">Clientes</span>}
          descricao={`Inativo é quem passou de ${DIAS_PARA_INATIVO} dias sem pedido.`}
          acoes={
            <Link href="/clientes" className="btn btn-ghost btn-sm shrink-0">
              Ver todos
            </Link>
          }
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SITUACOES.map((s) => {
              const n = contagem[s.situacao];
              return (
                <li key={s.situacao}>
                  <Link
                    href={`/clientes?filtro=${s.filtro}`}
                    className="quadro p-3 flex flex-col gap-1 h-full hover:border-[var(--border-strong)] transition-colors"
                  >
                    <span className="text-[13px] text-[var(--muted)]">{s.rotulo}</span>
                    <span
                      className={`text-2xl font-semibold tracking-tight tabular-nums ${
                        s.situacao === "inativo" && n > 0 ? "text-[var(--warning)]" : ""
                      }`}
                    >
                      {n}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <ClientesParados parados={parados} temCarteira={contagem.ativo + contagem.inativo > 0} />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 lg:gap-4">
        <section className="card p-5 flex flex-col gap-5 xl:col-span-2">
          <TituloCard titulo="Produção do mês" descricao="Artes aprovadas por dia, sem os clientes em teste" />
          <GraficoProducao dias={producao} hoje={hoje} />
        </section>

        <section className="card p-5 flex flex-col gap-4">
          <TituloCard
            titulo="Os dois números que decidem a margem"
            descricao="Todo o gasto até a aprovação, dividido pelas artes aprovadas."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 flex-1">
            <div className="quadro p-4 flex flex-col justify-center">
              <p className="text-[13px] text-[var(--muted)]">Custo por arte aprovada</p>
              <p className="text-2xl font-semibold tracking-tight mt-1">
                {formatarBRL(totais.custo_por_arte_aprovada)}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1.5">
                {totais.artes_aprovadas > 0
                  ? `${decimal(imagensPorArte)} ${
                      imagensPorArte < 2 ? "imagem" : "imagens"
                    } por arte, contando variações, ajustes e falhas. 1 é acertar de primeira.`
                  : "Sem arte aprovada ainda."}
              </p>
            </div>
            <div className="quadro p-4 flex flex-col justify-center">
              <p className="text-[13px] text-[var(--muted)]">Tempo humano por arte</p>
              <p className="text-2xl font-semibold tracking-tight mt-1">{decimal(totais.tempo_por_arte_min)} min</p>
              <p className="text-xs text-[var(--muted)] mt-1.5">
                Num pacote de {PACOTE_ENTRADA.qtdImagens} créditos por{" "}
                {formatarBRL(PACOTE_ENTRADA.valorCentavos / 100)}, é o tempo de gente que aperta a conta, não a
                API.
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="card p-5 flex flex-col gap-3">
        <TituloCard
          titulo="Por cliente"
          descricao="A margem considera só o custo de API. A mão de obra entra pelo tempo por arte."
        />
        {daAgencia.length === 0 ? (
          <EstadoVazio
            icone={BarChart3}
            titulo="Nenhum movimento neste mês"
            descricao="Quando um cliente tiver artes ou pagamentos no mês, os números dele aparecem aqui."
          />
        ) : (
          <TabelaPorCliente resumos={daAgencia} comReceita />
        )}
      </section>

      {emTeste.length > 0 && (
        <section className="card p-5 flex flex-col gap-3">
          <TituloCard
            titulo="Clientes em teste"
            descricao="Fora da receita, das cobranças e dos totais acima. O custo deles é da agência."
          />
          <TabelaPorCliente resumos={emTeste} />
        </section>
      )}
    </main>
  );
}

function ClientesParados({ parados, temCarteira }: { parados: ClienteNaCarteira[]; temCarteira: boolean }) {
  if (parados.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] self-center">
        {temCarteira
          ? `Ninguém parado: todos os clientes pediram nos últimos ${DIAS_PARA_INATIVO} dias.`
          : "Nenhum cliente na carteira ainda."}
      </p>
    );
  }

  const resto = parados.length - PARADOS_NO_PAINEL;
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <p className="text-[13px] font-medium">Sem pedir há mais tempo</p>
      <ul className="flex flex-col">
        {parados.slice(0, PARADOS_NO_PAINEL).map((c) => (
          <li key={c.id} className="border-t border-[var(--border)] first:border-t-0">
            <Link href={`/clientes/${c.id}`} className="flex items-center gap-2.5 py-1.5 min-w-0 group">
              <Avatar nome={c.nome} tamanho={24} />
              <span className="text-sm font-medium truncate group-hover:underline">{c.nome}</span>
              <span className="text-xs text-[var(--muted)] ml-auto shrink-0">
                {c.dias_sem_pedido === null ? "Nunca pediu" : `${c.dias_sem_pedido} dias`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {resto > 0 && (
        <Link
          href="/clientes?filtro=inativos"
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] w-fit"
        >
          E mais {resto} {resto === 1 ? "cliente parado" : "clientes parados"}
        </Link>
      )}
    </div>
  );
}

function TabelaPorCliente({ resumos, comReceita = false }: { resumos: ResumoCustoCliente[]; comReceita?: boolean }) {
  return (
    <div className="overflow-x-auto -mx-5">
      <table className={`w-full text-sm ${comReceita ? "min-w-[720px]" : "min-w-[480px]"}`}>
        <thead>
          <tr className="text-left text-[13px] text-[var(--muted)]">
            <th className="py-2.5 pl-5 font-medium">Cliente</th>
            <th className="py-2.5 px-3 font-medium text-right" title="Artes aprovadas no mês">
              Aprovadas
            </th>
            <th
              className="py-2.5 px-3 font-medium text-right"
              title="Imagens geradas por arte aprovada — 1 é acertar de primeira"
            >
              Img/arte
            </th>
            <th className="py-2.5 px-3 font-medium text-right" title="Custo de API do mês por arte aprovada">
              Custo/arte
            </th>
            <th className={`py-2.5 font-medium text-right ${comReceita ? "px-3" : "pr-5 pl-3"}`}>Custo</th>
            {comReceita && (
              <>
                <th className="py-2.5 px-3 font-medium text-right">Receita</th>
                <th className="py-2.5 pr-5 pl-3 font-medium text-right">Margem</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {resumos.map((r) => (
            <tr
              key={r.cliente_id}
              className="border-t border-[var(--border)] hover:bg-[var(--surface-muted)] transition-colors"
            >
              <td className="py-2.5 pl-5">
                <Link href={`/clientes/${r.cliente_id}`} className="flex items-center gap-2.5 font-medium">
                  <Avatar nome={r.cliente_nome} tamanho={28} />
                  {r.cliente_nome}
                </Link>
              </td>
              <td className="py-2.5 px-3 text-right">{r.artes_aprovadas}</td>
              <td className="py-2.5 px-3 text-right">
                {r.geracoes_por_arte > 0 ? decimal(r.geracoes_por_arte) : "—"}
              </td>
              <td className="py-2.5 px-3 text-right">
                {r.artes_aprovadas > 0 ? formatarBRL(r.custo_brl / r.artes_aprovadas) : "—"}
              </td>
              <td className={`py-2.5 text-right ${comReceita ? "px-3" : "pr-5 pl-3"}`}>{formatarBRL(r.custo_brl)}</td>
              {comReceita && (
                <>
                  <td className="py-2.5 px-3 text-right">{formatarBRL(r.receita_brl)}</td>
                  <td
                    className={`py-2.5 pr-5 pl-3 text-right font-semibold ${
                      r.margem_brl < 0 ? "text-[var(--danger)]" : ""
                    }`}
                  >
                    {formatarBRL(r.margem_brl)}
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Indicador({
  titulo,
  icone: Icone,
  valor,
  ajuda,
  destaque,
}: {
  titulo: string;
  icone: LucideIcon;
  valor: string;
  ajuda: string;
  destaque?: "ok" | "alerta";
}) {
  return (
    <div className="card p-4 lg:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-[var(--muted)]">{titulo}</p>
        <Icone size={16} className="text-[var(--muted)] shrink-0" aria-hidden="true" />
      </div>
      <p
        className={`text-2xl lg:text-[30px] font-semibold tracking-tight mt-2 truncate ${
          destaque === "alerta" ? "text-[var(--danger)]" : destaque === "ok" ? "text-[var(--success)]" : ""
        }`}
      >
        {valor}
      </p>
      <p className="text-xs text-[var(--muted)] mt-1.5">{ajuda}</p>
    </div>
  );
}
