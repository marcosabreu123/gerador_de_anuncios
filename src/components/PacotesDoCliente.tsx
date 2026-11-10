import Link from "next/link";
import FormVenderPacote, { type RenovacaoPlano } from "@/components/FormVenderPacote";
import HistoricoPacotes from "@/components/HistoricoPacotes";
import { TituloCard } from "@/components/ui";
import { diasEntre, formatarDia } from "@/lib/datas";
import { JANELA_PADRAO, SELO_SITUACAO, prazoDoPlano, situacaoDoPlano } from "@/lib/agencia/cobrancas";
import type { Pacote, Pagamento } from "@/lib/agencia/types";

// Aba "Pacotes e pagamentos" do cliente (só sócio). A venda fica na coluna da
// direita do começo ao fim no PC, à vista sem rolar; no celular ela vem logo
// depois do saldo, antes do histórico.
export default function PacotesDoCliente({
  clienteId,
  saldo,
  pagamentos,
  precos,
  renovacao,
}: {
  clienteId: string;
  saldo: {
    disponivel: number;
    usado: number;
    total: number;
    // Do mais novo para o mais antigo.
    pacotes: Pacote[];
    hoje: string;
    plano: Pacote | null;
  };
  pagamentos: Pagamento[];
  precos: Record<string, number>;
  renovacao: RenovacaoPlano | null;
}) {
  const { plano, hoje } = saldo;
  const dias = plano?.validade ? diasEntre(hoje, plano.validade) : null;
  const situacao = situacaoDoPlano(dias, JANELA_PADRAO);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] xl:grid-rows-[auto_1fr] gap-4 items-start">
      <section className="card p-5 flex flex-col gap-4">
        <TituloCard titulo="Saldo e plano" />
        <div className="grid grid-cols-3 gap-3">
          <Numero rotulo="Disponível" valor={saldo.disponivel} />
          <Numero rotulo="Usado" valor={saldo.usado} />
          <Numero rotulo="Comprado" valor={saldo.total} />
        </div>
        {plano?.validade && dias !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-[var(--border)] pt-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{plano.nome}</p>
              <p className="text-[13px] text-[var(--muted)] mt-0.5">
                Assinado em {formatarDia(plano.assinado_em)} · {dias < 0 ? "venceu" : "vence"} em{" "}
                {formatarDia(plano.validade)}
              </p>
            </div>
            <span className={`badge ${SELO_SITUACAO[situacao].tom}`}>
              {situacao === "em_dia" ? "Em dia" : prazoDoPlano(dias)}
            </span>
          </div>
        ) : (
          <p className="text-[13px] text-[var(--muted)] border-t border-[var(--border)] pt-4">
            Sem plano por tempo. Os pacotes de imagens não vencem.
          </p>
        )}
      </section>

      <section className="card p-5 flex flex-col gap-4 xl:col-start-2 xl:row-start-1 xl:row-span-2">
        <TituloCard
          titulo={renovacao ? "Renovar plano" : "Vender plano ou pacote"}
          descricao={renovacao ? `Com os dados do ${renovacao.nome.replace(/^Plano/, "plano")}.` : undefined}
          acoes={
            renovacao && (
              <Link
                href={`/clientes/${clienteId}#pacotes`}
                scroll={false}
                className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] shrink-0"
              >
                Limpar
              </Link>
            )
          }
        />
        <FormVenderPacote
          key={renovacao?.id ?? "novo"}
          clienteId={clienteId}
          hoje={hoje}
          coberturaAtual={plano?.validade ?? null}
          precos={precos}
          renovacao={renovacao}
          mesesSugeridos={plano?.meses ?? null}
        />
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <TituloCard titulo="Histórico" descricao="Cada plano ou pacote vendido, com o pagamento dele." />
        <HistoricoPacotes
          clienteId={clienteId}
          pacotes={saldo.pacotes}
          pagamentos={pagamentos}
          hoje={hoje}
          ultimoPlanoId={plano?.id ?? null}
        />
      </section>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="quadro p-3.5">
      <p className="text-[13px] text-[var(--muted)]">{rotulo}</p>
      <p className="text-2xl font-semibold tracking-tight mt-0.5">{valor}</p>
    </div>
  );
}
