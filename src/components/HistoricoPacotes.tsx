import Link from "next/link";
import { RefreshCw } from "lucide-react";
import BotaoConfirmar from "@/components/BotaoConfirmar";
import BotaoEnviar from "@/components/BotaoEnviar";
import { cancelarPacote, confirmarPagamento } from "@/app/(app)/clientes/actions";
import { formatarDia, hojeSP } from "@/lib/datas";
import { seloDoPacote } from "@/lib/agencia/cobrancas";
import { centavosParaBRL, rotuloDoMetodo, type Pacote, type Pagamento } from "@/lib/agencia/types";

// Planos do cliente, cada um com o próprio pagamento. Juntos porque é assim que o
// sócio pensa a conta: "o plano de março foi pago?". Pacotes avulsos antigos
// também aparecem: a agência não vende mais, mas o registro continua.
export default function HistoricoPacotes({
  clienteId,
  pacotes,
  pagamentos,
  hoje,
  ultimoPlanoId,
}: {
  clienteId: string;
  // Do mais novo para o mais antigo.
  pacotes: Pacote[];
  pagamentos: Pagamento[];
  hoje: string;
  ultimoPlanoId: string | null;
}) {
  const semPacote = pagamentos.filter((pg) => !pg.pacote_id || !pacotes.some((p) => p.id === pg.pacote_id));

  if (pacotes.length === 0 && semPacote.length === 0) {
    return <p className="text-sm text-[var(--muted)]">Nenhum plano registrado ainda.</p>;
  }

  return (
    <ul className="flex flex-col">
      {pacotes.map((p) => {
        const selo = seloDoPacote(p, hoje, ultimoPlanoId);
        // O mais recente primeiro: é o que vale olhar quando há mais de um.
        const doPacote = pagamentos.filter((pg) => pg.pacote_id === p.id);
        const pagamento = doPacote[0] ?? null;
        const pendente = doPacote.find((pg) => pg.status === "pendente") ?? null;
        const restante = Math.max(0, p.qtd_imagens - p.qtd_usadas);
        const vencido = Boolean(p.validade && p.validade < hoje);
        const renovavel = p.id === ultimoPlanoId;
        const cancelavel =
          p.status !== "cancelado" && !vencido && (p.tipo === "tempo" || restante > 0 || Boolean(pendente));

        const detalhes = [
          `Contratado em ${formatarDia(p.assinado_em)}`,
          p.validade && `${vencido ? "venceu" : "vence"} em ${formatarDia(p.validade)}`,
          `${p.qtd_usadas} de ${p.qtd_imagens} ${p.qtd_imagens === 1 ? "crédito usado" : "créditos usados"}`,
        ].filter(Boolean);

        return (
          <li key={p.id} className="flex flex-col gap-2 py-3 border-t first:border-t-0 border-[var(--border)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium flex flex-wrap items-center gap-x-2 gap-y-1">
                  {p.nome}
                  <span className={`badge ${selo.tom}`}>{selo.rotulo}</span>
                </p>
                <p className="text-[13px] text-[var(--muted)] mt-1">{detalhes.join(" · ")}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums shrink-0">{centavosParaBRL(p.valor_centavos)}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-[13px] text-[var(--muted)]">
                {pagamento ? <SituacaoDoPagamento pagamento={pagamento} /> : "Sem pagamento registrado"}
              </p>
              {(pendente || renovavel || cancelavel) && (
                <div className="flex flex-wrap items-center gap-2">
                  {pendente && (
                    <form action={confirmarPagamento}>
                      <input type="hidden" name="id" value={pendente.id} />
                      <input type="hidden" name="cliente_id" value={clienteId} />
                      <BotaoEnviar className="btn btn-outline btn-sm">Marcar como pago</BotaoEnviar>
                    </form>
                  )}
                  {renovavel && (
                    <Link
                      href={`/clientes/${clienteId}?renovar=${p.id}#plano`}
                      scroll={false}
                      className="btn btn-outline btn-sm"
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      Renovar
                    </Link>
                  )}
                  {cancelavel && (
                    <form action={cancelarPacote}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="cliente_id" value={clienteId} />
                      <BotaoConfirmar
                        className="btn btn-ghost btn-sm"
                        pergunta={`Cancelar ${p.nome.replace(/^(Plano|Pacote)/, (m) => m.toLowerCase())}? ${
                          restante > 0
                            ? `${restante === 1 ? "O crédito que sobrou deixa" : `Os ${restante} créditos que sobraram deixam`} de valer.`
                            : ""
                        }${pendente ? " O pagamento em aberto deixa de ser cobrado." : ""}`.trim()}
                      >
                        Cancelar
                      </BotaoConfirmar>
                    </form>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}

      {semPacote.map((pg) => (
        <li
          key={pg.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3 border-t first:border-t-0 border-[var(--border)]"
        >
          <span className="text-sm">
            Pagamento avulso <span className="text-[var(--muted)]">· {centavosParaBRL(pg.valor_centavos)}</span>
          </span>
          <span className="text-[13px] text-[var(--muted)]">
            <SituacaoDoPagamento pagamento={pg} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function SituacaoDoPagamento({ pagamento }: { pagamento: Pagamento }) {
  const metodo = rotuloDoMetodo(pagamento.metodo);
  if (pagamento.status === "confirmado") {
    return (
      <>
        {metodo} · pago{pagamento.pago_em ? ` em ${formatarDia(hojeSP(new Date(pagamento.pago_em)))}` : ""}
      </>
    );
  }
  if (pagamento.status === "pendente") {
    return (
      <>
        {metodo} · <span className="font-medium text-[var(--warning)]">aguardando pagamento</span>
      </>
    );
  }
  return <>{metodo} · cancelado</>;
}
