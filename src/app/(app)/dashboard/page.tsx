import Link from "next/link";
import { BarChart3, Banknote, Images, Receipt, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { requireSocio } from "@/lib/auth";
import GraficoProducao from "@/components/GraficoProducao";
import { Avatar, CabecalhoPagina, EstadoVazio, TituloCard } from "@/components/ui";
import {
  diaDoMesAgora,
  mesAtual,
  producaoPorDia,
  resumoPorCliente,
  totalizar,
} from "@/lib/agencia/relatorio";
import { formatarBRL } from "@/lib/agencia/types";

// Painel dos sócios. Substitui o dashboard do lojista do modelo antigo (que
// mostrava os três fluxos de criação e o saldo de créditos de quem estava
// logado) — aqui o que importa é quanto cada cliente deu de receita, custo e
// margem no mês.

const decimal = (valor: number) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export default async function DashboardPage() {
  await requireSocio();
  const periodo = mesAtual();
  const [resumos, producao] = await Promise.all([resumoPorCliente(periodo), producaoPorDia(periodo)]);
  const totais = totalizar(resumos);

  const comMovimento = resumos.filter((r) => r.geracoes > 0 || r.receita_brl > 0 || r.pecas_entregues > 0);
  const mes = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
  const prejuizo = totais.margem_brl < 0;

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
          ajuda="Inclui gerações que falharam"
        />
        <Indicador
          titulo="Margem"
          icone={prejuizo ? TrendingDown : TrendingUp}
          valor={formatarBRL(totais.margem_brl)}
          ajuda="Receita menos custo de API, sem mão de obra"
          destaque={prejuizo ? "alerta" : totais.margem_brl > 0 ? "ok" : undefined}
        />
        <Indicador
          titulo="Peças entregues"
          icone={Images}
          valor={String(totais.pecas_entregues)}
          ajuda="Peças geradas ou aprovadas"
        />
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 lg:gap-4">
        <section className="card p-5 flex flex-col gap-5 xl:col-span-2">
          <TituloCard titulo="Produção do mês" descricao="Peças entregues por dia" />
          <GraficoProducao dias={producao} hoje={diaDoMesAgora()} />
        </section>

        <section className="card p-5 flex flex-col gap-4">
          <TituloCard titulo="Os dois números que decidem a margem" />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3 flex-1">
            <div className="quadro p-4 flex flex-col justify-center">
              <p className="text-[13px] text-[var(--muted)]">Custo médio por peça entregue</p>
              <p className="text-2xl font-semibold tracking-tight mt-1">
                {formatarBRL(totais.custo_medio_por_peca)}
              </p>
              <p className="text-xs text-[var(--muted)] mt-1.5">
                {totais.pecas_entregues > 0
                  ? `${decimal(totais.geracoes / totais.pecas_entregues)} imagem por peça. 1 é acertar de primeira.`
                  : "Sem peças entregues ainda."}
              </p>
            </div>
            <div className="quadro p-4 flex flex-col justify-center">
              <p className="text-[13px] text-[var(--muted)]">Tempo humano por peça</p>
              <p className="text-2xl font-semibold tracking-tight mt-1">
                {decimal(totais.tempo_medio_por_peca_min)} min
              </p>
              <p className="text-xs text-[var(--muted)] mt-1.5">
                Num pacote de 10 imagens por {formatarBRL(34.9)}, é o tempo de gente que aperta a conta, não a API.
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="card p-5 flex flex-col gap-3">
        <TituloCard
          titulo="Por cliente"
          descricao="A margem considera só o custo de API. A mão de obra entra pelo tempo por peça."
        />
        {comMovimento.length === 0 ? (
          <EstadoVazio
            icone={BarChart3}
            titulo="Nenhum movimento neste mês"
            descricao="Quando um cliente tiver peças ou pagamentos no mês, os números dele aparecem aqui."
          />
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-left text-[13px] text-[var(--muted)]">
                  <th className="py-2.5 pl-5 font-medium">Cliente</th>
                  <th className="py-2.5 px-3 font-medium text-right">Peças</th>
                  <th
                    className="py-2.5 px-3 font-medium text-right"
                    title="Imagens geradas por peça entregue — 1 é acertar de primeira"
                  >
                    Img/peça
                  </th>
                  <th className="py-2.5 px-3 font-medium text-right">Custo</th>
                  <th className="py-2.5 px-3 font-medium text-right">Receita</th>
                  <th className="py-2.5 pr-5 pl-3 font-medium text-right">Margem</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {comMovimento.map((r) => (
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
                    <td className="py-2.5 px-3 text-right">{r.pecas_entregues}</td>
                    <td className="py-2.5 px-3 text-right">
                      {r.geracoes_por_peca > 0 ? decimal(r.geracoes_por_peca) : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right">{formatarBRL(r.custo_brl)}</td>
                    <td className="py-2.5 px-3 text-right">{formatarBRL(r.receita_brl)}</td>
                    <td
                      className={`py-2.5 pr-5 pl-3 text-right font-semibold ${
                        r.margem_brl < 0 ? "text-[var(--danger)]" : ""
                      }`}
                    >
                      {formatarBRL(r.margem_brl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
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
