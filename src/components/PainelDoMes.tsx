import { BadgeCheck, Banknote, Receipt, TrendingDown, TrendingUp, Users, type LucideIcon } from "lucide-react";
import GraficoProducao from "@/components/GraficoProducao";
import TabelaPorCliente from "@/components/TabelaPorCliente";
import { CabecalhoPagina, EstadoVazio, LegendaSituacao, TituloCard } from "@/components/ui";
import { totalizar, type RelatorioDoMes } from "@/lib/agencia/relatorio";
import { DIAS_PARA_INATIVO, type SituacaoCliente } from "@/lib/agencia/situacao-cliente";
import { formatarBRL, teveMovimento } from "@/lib/agencia/types";

// Painel dos sócios: o mês de relance. Receita e margem contam só quem paga; o
// custo de geração e as artes aprovadas contam todos, com a parte dos clientes em
// teste à parte. Logo abaixo, cada cliente numa linha. O dinheiro que saiu, a
// recarga da OpenAI inclusive, fica no Financeiro: o custo daqui já está dentro
// dela, então os dois nunca se somam. Só desenha: quem carrega os números é a
// página do painel.

const decimal = (valor: number) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const ORDEM_DA_LEGENDA: SituacaoCliente[] = ["ativo", "inativo", "em_teste", "arquivado"];

export default function PainelDoMes({
  resumos,
  producao,
  mes,
  hoje,
}: RelatorioDoMes & { mes: string; hoje: number }) {
  const totais = totalizar(resumos);

  // Arquivado só aparece se teve alguma coisa no mês; os outros, sempre.
  const naTabela = resumos.filter((r) => r.situacao !== "arquivado" || teveMovimento(r));
  const legenda = ORDEM_DA_LEGENDA.filter((s) => naTabela.some((r) => r.situacao === s));

  const prejuizo = totais.margem_brl < 0;
  const imagensPorArte = totais.artes_aprovadas > 0 ? totais.geracoes / totais.artes_aprovadas : null;

  const ajudaAprovadas = [
    totais.artes_em_teste > 0 && `${totais.artes_em_teste} de clientes em teste`,
    totais.aguardando_aprovacao > 0 &&
      `${totais.aguardando_aprovacao} ${totais.aguardando_aprovacao === 1 ? "pronta" : "prontas"}, ainda sem aprovação`,
  ].filter(Boolean);

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
          ajuda="Pagamentos confirmados no mês, só dos clientes que pagam"
        />
        <Indicador
          titulo="Custo de geração"
          icone={Receipt}
          valor={formatarBRL(totais.custo_brl)}
          ajuda={
            totais.custo_em_teste_brl > 0
              ? `Todos os clientes, com falhas. ${formatarBRL(totais.custo_em_teste_brl)} foi de clientes em teste`
              : "Todos os clientes, contando as gerações que falharam"
          }
        />
        <Indicador
          titulo="Margem"
          icone={prejuizo ? TrendingDown : TrendingUp}
          valor={formatarBRL(totais.margem_brl)}
          ajuda="Receita menos o custo de geração dos clientes que pagam"
          destaque={prejuizo ? "alerta" : totais.margem_brl > 0 ? "ok" : undefined}
        />
        <Indicador
          titulo="Artes aprovadas"
          icone={BadgeCheck}
          valor={String(totais.artes_aprovadas)}
          ajuda={ajudaAprovadas.length > 0 ? ajudaAprovadas.join(" · ") : "1 crédito por arte aprovada"}
        />
      </section>

      <section className="card p-5 flex flex-col gap-3" aria-labelledby="titulo-por-cliente">
        <TituloCard
          titulo={<span id="titulo-por-cliente">Por cliente</span>}
          descricao={`Inativo é quem passou de ${DIAS_PARA_INATIVO} dias sem pedido. Em cinza, quem não teve nada no mês. Clique no nome de uma coluna para ordenar.`}
        />
        {naTabela.length === 0 ? (
          <EstadoVazio
            icone={Users}
            titulo="Nenhum cliente ainda"
            descricao="Quando houver clientes cadastrados, o mês de cada um aparece aqui."
          />
        ) : (
          <>
            <LegendaSituacao situacoes={legenda} />
            <TabelaPorCliente resumos={naTabela} />
          </>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 lg:gap-4">
        <section className="card p-5 flex flex-col gap-5 xl:col-span-2">
          <TituloCard titulo="Produção do mês" descricao="Artes aprovadas por dia, de todos os clientes" />
          <GraficoProducao dias={producao} hoje={hoje} />
        </section>

        <section className="card p-5 flex flex-col gap-4">
          <TituloCard
            titulo="O que decide a margem"
            descricao="Todo o custo de geração até a aprovação, dividido pelas artes aprovadas."
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 flex-1">
            <div className="quadro p-4 flex flex-col justify-center">
              <p className="text-[13px] text-[var(--muted)]">Custo por arte aprovada</p>
              <p className="text-2xl font-semibold tracking-tight mt-1 tabular-nums">
                {totais.artes_aprovadas > 0 ? formatarBRL(totais.custo_por_arte_aprovada) : "—"}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1.5">
                {totais.artes_aprovadas > 0
                  ? "Custo de geração do mês dividido pelas artes aprovadas, de todos os clientes."
                  : "Sem arte aprovada ainda."}
              </p>
            </div>
            <div className="quadro p-4 flex flex-col justify-center">
              <p className="text-[13px] text-[var(--muted)]">Imagens por arte</p>
              <p className="text-2xl font-semibold tracking-tight mt-1 tabular-nums">
                {imagensPorArte === null ? "—" : decimal(imagensPorArte)}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1.5">
                {imagensPorArte === null
                  ? "Sem arte aprovada ainda."
                  : "Contando variações, ajustes e falhas. 1 é acertar de primeira."}
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
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
    <div className="card indicador p-4 lg:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-[var(--muted)]">{titulo}</p>
        <Icone size={16} className="text-[var(--muted)] shrink-0" aria-hidden="true" />
      </div>
      <p
        className={`valor-indicador font-semibold tracking-tight mt-2 truncate tabular-nums ${
          destaque === "alerta" ? "text-[var(--danger)]" : destaque === "ok" ? "text-[var(--success)]" : ""
        }`}
      >
        {valor}
      </p>
      <p className="text-xs text-[var(--muted)] mt-1.5">{ajuda}</p>
    </div>
  );
}
