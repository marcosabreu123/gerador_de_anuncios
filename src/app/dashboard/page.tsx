import Link from "next/link";
import { requireSocio } from "@/lib/auth";
import AgenciaHeader from "@/components/AgenciaHeader";
import { mesAtual, resumoPorCliente, totalizar } from "@/lib/agencia/relatorio";
import { formatarBRL } from "@/lib/agencia/types";

// Painel dos sócios. Substitui o dashboard do lojista do modelo antigo (que
// mostrava os três fluxos de criação e o saldo de créditos de quem estava
// logado) — aqui o que importa é quanto cada cliente deu de receita, custo e
// margem no mês.

export default async function DashboardPage() {
  const { perfil } = await requireSocio();
  const periodo = mesAtual();
  const resumos = await resumoPorCliente(periodo);
  const totais = totalizar(resumos);

  const comMovimento = resumos.filter((r) => r.geracoes > 0 || r.receita_brl > 0 || r.pecas_entregues > 0);

  return (
    <>
      <AgenciaHeader nome={perfil.nome ?? perfil.email} papel={perfil.papel} />
      <main className="app-shell py-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Painel do mês</h1>
            <p className="text-sm text-[var(--muted)] mt-1">
              Receita confirmada, custo real de API e margem por cliente.
            </p>
          </div>
          <Link href="/clientes" className="btn btn-primary">
            Clientes
          </Link>
        </div>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Indicador titulo="Receita" valor={formatarBRL(totais.receita_brl)} ajuda="Pagamentos confirmados no mês" />
          <Indicador titulo="Custo de API" valor={formatarBRL(totais.custo_brl)} ajuda="Inclui gerações que falharam" />
          <Indicador
            titulo="Margem"
            valor={formatarBRL(totais.margem_brl)}
            ajuda="Receita menos custo de API — ainda sem contar mão de obra"
            destaque={totais.margem_brl >= 0 ? "ok" : "alerta"}
          />
          <Indicador titulo="Peças entregues" valor={String(totais.pecas_entregues)} ajuda="Peças geradas ou aprovadas" />
        </section>

        <section className="card p-4 flex flex-col gap-2">
          <h2 className="font-semibold">Os dois números que decidem a margem</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
            <div className="bg-[var(--surface-muted)] rounded-xl p-3">
              <p className="text-xs text-[var(--muted)]">Custo médio por peça entregue</p>
              <p className="text-xl font-bold">{formatarBRL(totais.custo_medio_por_peca)}</p>
              <p className="text-xs text-[var(--muted)] mt-1">
                {totais.pecas_entregues > 0
                  ? `${(totais.geracoes / totais.pecas_entregues).toFixed(1)} geração(ões) por peça — quanto mais perto de 1, menos retrabalho.`
                  : "Sem peças entregues ainda."}
              </p>
            </div>
            <div className="bg-[var(--surface-muted)] rounded-xl p-3">
              <p className="text-xs text-[var(--muted)]">Tempo humano por peça</p>
              <p className="text-xl font-bold">{totais.tempo_medio_por_peca_min.toFixed(1)} min</p>
              <p className="text-xs text-[var(--muted)] mt-1">
                Num pacote de 10 imagens por {formatarBRL(34.9)}, é o tempo de gente que aperta a conta — não a API.
              </p>
            </div>
          </div>
        </section>

        <section className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold">Por cliente</h2>
          {comMovimento.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nenhum movimento neste mês ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--muted)]">
                    <th className="py-2 font-medium">Cliente</th>
                    <th className="py-2 font-medium text-right">Peças</th>
                    <th className="py-2 font-medium text-right">Ger./peça</th>
                    <th className="py-2 font-medium text-right">Custo</th>
                    <th className="py-2 font-medium text-right">Receita</th>
                    <th className="py-2 font-medium text-right">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {comMovimento.map((r) => (
                    <tr key={r.cliente_id} className="border-t border-[var(--border)]">
                      <td className="py-2">
                        <Link href={`/clientes/${r.cliente_id}`} className="hover:underline">
                          {r.cliente_nome}
                        </Link>
                      </td>
                      <td className="py-2 text-right">{r.pecas_entregues}</td>
                      <td className="py-2 text-right">
                        {r.geracoes_por_peca > 0 ? r.geracoes_por_peca.toFixed(1) : "—"}
                      </td>
                      <td className="py-2 text-right">{formatarBRL(r.custo_brl)}</td>
                      <td className="py-2 text-right">{formatarBRL(r.receita_brl)}</td>
                      <td
                        className={`py-2 text-right font-semibold ${
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
          <p className="text-xs text-[var(--muted)]">
            A margem acima considera só o custo de API. O custo de mão de obra entra pelo tempo por peça,
            no painel acima.
          </p>
        </section>
      </main>
    </>
  );
}

function Indicador({
  titulo,
  valor,
  ajuda,
  destaque,
}: {
  titulo: string;
  valor: string;
  ajuda: string;
  destaque?: "ok" | "alerta";
}) {
  return (
    <div className="card p-4">
      <p className="text-xs text-[var(--muted)]">{titulo}</p>
      <p
        className={`text-2xl font-bold mt-1 ${
          destaque === "alerta" ? "text-[var(--danger)]" : destaque === "ok" ? "text-[var(--success)]" : ""
        }`}
      >
        {valor}
      </p>
      <p className="text-[11px] text-[var(--muted)] mt-1">{ajuda}</p>
    </div>
  );
}
