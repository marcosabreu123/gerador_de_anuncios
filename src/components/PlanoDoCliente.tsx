import Link from "next/link";
import type { RenovacaoPlano } from "@/components/CamposPlano";
import FormPlano from "@/components/FormPlano";
import HistoricoPacotes from "@/components/HistoricoPacotes";
import { TituloCard } from "@/components/ui";
import { diasEntre, formatarDia } from "@/lib/datas";
import { JANELA_PADRAO, SELO_SITUACAO, prazoDoPlano, situacaoDoPlano } from "@/lib/agencia/cobrancas";
import type { Pacote, Pagamento } from "@/lib/agencia/types";

// Aba "Plano e pagamentos" do cliente (só sócio). O registro do plano fica na
// coluna da direita do começo ao fim no PC, à vista sem rolar; no celular ele vem
// logo depois do saldo, antes do histórico.
export default function PlanoDoCliente({
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
    emTeste: boolean;
  };
  pagamentos: Pagamento[];
  precos: Record<string, number>;
  renovacao: RenovacaoPlano | null;
}) {
  const { plano, hoje, emTeste } = saldo;
  const dias = plano?.validade ? diasEntre(hoje, plano.validade) : null;
  const situacao = situacaoDoPlano(dias, JANELA_PADRAO);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_400px] xl:grid-rows-[auto_1fr] gap-4 items-start">
      <section className="card p-5 flex flex-col gap-4">
        <TituloCard titulo="Créditos e plano" />
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
                Contratado em {formatarDia(plano.assinado_em)} · {dias < 0 ? "venceu" : "vence"} em{" "}
                {formatarDia(plano.validade)}
              </p>
            </div>
            {emTeste ? (
              <span className="badge badge-accent">Em teste</span>
            ) : (
              <span className={`badge ${SELO_SITUACAO[situacao].tom}`}>
                {situacao === "em_dia" ? "Em dia" : prazoDoPlano(dias)}
              </span>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--muted)] border-t border-[var(--border)] pt-4">
            {emTeste
              ? "Cliente em teste: não paga nem usa crédito. Registrar o primeiro plano tira ele do teste."
              : "Sem plano. Todo cliente que paga precisa de um, de no mínimo 1 mês, contado da contratação."}
          </p>
        )}
      </section>

      <section className="card p-5 flex flex-col gap-4 xl:col-start-2 xl:row-start-1 xl:row-span-2">
        <TituloCard
          titulo={renovacao ? "Renovar plano" : plano ? "Registrar plano" : "Primeiro plano"}
          descricao={renovacao ? `Com os dados do ${renovacao.nome.replace(/^Plano/, "plano")}.` : undefined}
          acoes={
            renovacao && (
              <Link
                href={`/clientes/${clienteId}#plano`}
                scroll={false}
                className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] shrink-0"
              >
                Limpar
              </Link>
            )
          }
        />
        <FormPlano
          key={renovacao?.id ?? "novo"}
          clienteId={clienteId}
          hoje={hoje}
          coberturaAtual={plano?.validade ?? null}
          precos={precos}
          renovacao={renovacao}
          mesesSugeridos={plano?.meses ?? null}
          emTeste={emTeste}
        />
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <TituloCard titulo="Histórico" descricao="Cada plano registrado, com o pagamento dele." />
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
