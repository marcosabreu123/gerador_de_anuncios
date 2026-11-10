import { requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PainelCobrancas, { type PagamentoDaLista } from "@/components/PainelCobrancas";
import { CabecalhoPagina } from "@/components/ui";
import { hojeSP } from "@/lib/datas";
import { FILTROS_COBRANCA, montarLinhas, type FiltroCobranca } from "@/lib/agencia/cobrancas";
import { mesAtual } from "@/lib/agencia/relatorio";
import type { Pacote, Pagamento } from "@/lib/agencia/types";

// Quantos pagamentos a lista de baixo mostra. O resto continua na página de cada
// cliente.
const PAGAMENTOS_NA_LISTA = 40;

// Carteira de cobrança: quem está vencendo, quem venceu, quem deve e quem está em
// dia. Só sócio, como tudo que mostra dinheiro.
export default async function CobrancasPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  await requireSocio();
  const { filtro } = await searchParams;
  const supabase = await createClient();
  const hoje = hojeSP();
  const periodo = mesAtual();

  const [{ data: clientesRaw }, { data: pacotesRaw }, { data: pagamentosRaw }, { data: logos }] = await Promise.all([
    supabase.from("clientes").select("id, nome, nicho, ativo").order("nome"),
    supabase.from("pacotes").select("*"),
    supabase.from("pagamentos").select("*"),
    supabase.from("referencias").select("cliente_id, url").eq("tipo", "logo"),
  ]);

  const clientes = (clientesRaw ?? []) as { id: string; nome: string; nicho: string | null; ativo: boolean }[];
  const pacotes = (pacotesRaw ?? []) as Pacote[];
  const pagamentos = (pagamentosRaw ?? []) as Pagamento[];

  // Arquivado saiu da carteira: não entra na lista nem no número do menu.
  const linhas = montarLinhas({
    clientes: clientes.filter((c) => c.ativo),
    pacotes,
    pagamentos,
    logos: new Map((logos ?? []).map((l) => [l.cliente_id as string, l.url as string])),
    hoje,
  });

  // Mesma conta da receita do painel, para os dois números baterem.
  const inicio = Date.parse(periodo.inicio);
  const fim = Date.parse(periodo.fim);
  const recebidoNoMesCentavos = pagamentos
    .filter((pg) => pg.status === "confirmado" && pg.pago_em)
    .filter((pg) => {
      const quando = Date.parse(pg.pago_em!);
      return quando >= inicio && quando <= fim;
    })
    .reduce((soma, pg) => soma + pg.valor_centavos, 0);

  const nomeDoCliente = new Map(clientes.map((c) => [c.id, c.nome]));
  const nomeDoPacote = new Map(pacotes.map((p) => [p.id, p.nome]));
  const momento = (pg: Pagamento) => pg.pago_em ?? pg.created_at;
  const historico: PagamentoDaLista[] = [...pagamentos]
    .sort((a, b) => Date.parse(momento(b)) - Date.parse(momento(a)))
    .slice(0, PAGAMENTOS_NA_LISTA)
    .map((pg) => ({
      id: pg.id,
      clienteId: pg.cliente_id,
      cliente: nomeDoCliente.get(pg.cliente_id) ?? "Cliente",
      descricao: (pg.pacote_id && nomeDoPacote.get(pg.pacote_id)) || "Pagamento avulso",
      valorCentavos: pg.valor_centavos,
      metodo: pg.metodo,
      status: pg.status,
      dia: hojeSP(new Date(momento(pg))),
    }));

  const mes = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });
  const filtroInicial = (FILTROS_COBRANCA as readonly string[]).includes(filtro ?? "")
    ? (filtro as FiltroCobranca)
    : "todos";

  return (
    <main className="pagina flex flex-col gap-6">
      <CabecalhoPagina titulo="Cobranças" descricao="Plano, vencimento e pagamento de cada cliente ativo." />
      <PainelCobrancas
        linhas={linhas}
        historico={historico}
        recebidoNoMesCentavos={recebidoNoMesCentavos}
        mes={mes}
        filtroInicial={filtroInicial}
      />
    </main>
  );
}
