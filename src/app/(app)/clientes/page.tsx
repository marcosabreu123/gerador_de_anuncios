import { requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PainelClientes, { type PagamentoDaLista } from "@/components/PainelClientes";
import { hojeSP } from "@/lib/datas";
import { filtroDeClientes, montarLinhas, precosSugeridos, type ClienteDaCarteira } from "@/lib/agencia/cobrancas";
import { mesAtual } from "@/lib/agencia/relatorio";
import { ultimosPedidos } from "@/lib/agencia/situacao-cliente";
import type { Pacote, Pagamento } from "@/lib/agencia/types";

// Quantos pagamentos a lista de baixo mostra. O resto continua na página de cada
// cliente.
const PAGAMENTOS_NA_LISTA = 40;

// A carteira: de cada cliente, a situação, o plano, o vencimento, o pagamento e
// os créditos. É aqui que o sócio cadastra cliente novo, com o primeiro plano ou
// em teste. Só sócio, como tudo que mostra dinheiro.
export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; novo?: string }>;
}) {
  await requireSocio();
  const { filtro, novo } = await searchParams;
  const supabase = await createClient();
  const hoje = hojeSP();
  const periodo = mesAtual();

  const [{ data: clientesRaw }, { data: pacotesRaw }, { data: pagamentosRaw }, { data: logos }, ultimos] =
    await Promise.all([
      supabase.from("clientes").select("id, nome, nicho, ativo, em_teste, created_at").order("nome"),
      supabase.from("pacotes").select("*").order("created_at", { ascending: false }),
      supabase.from("pagamentos").select("*"),
      supabase.from("referencias").select("cliente_id, url").eq("tipo", "logo"),
      ultimosPedidos(supabase),
    ]);

  const clientes = (clientesRaw ?? []) as ClienteDaCarteira[];
  const pacotes = (pacotesRaw ?? []) as Pacote[];
  const pagamentos = (pagamentosRaw ?? []) as Pagamento[];

  const linhas = montarLinhas({
    clientes,
    pacotes,
    pagamentos,
    logos: new Map((logos ?? []).map((l) => [l.cliente_id as string, l.url as string])),
    ultimos,
    hoje,
  });

  // Mesma conta da receita do painel, para os dois números baterem: sem os
  // clientes em teste.
  const inicio = Date.parse(periodo.inicio);
  const fim = Date.parse(periodo.fim);
  const emTeste = new Set(clientes.filter((c) => c.em_teste).map((c) => c.id));
  const recebidoNoMesCentavos = pagamentos
    .filter((pg) => pg.status === "confirmado" && pg.pago_em && !emTeste.has(pg.cliente_id))
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

  return (
    <main className="pagina flex flex-col gap-6">
      <PainelClientes
        linhas={linhas}
        historico={historico}
        recebidoNoMesCentavos={recebidoNoMesCentavos}
        mes={mes}
        filtroInicial={filtroDeClientes(filtro)}
        cadastroAberto={novo === "1"}
        hoje={hoje}
        // O último valor cobrado em cada duração, para o cadastro já vir preenchido.
        precos={precosSugeridos(pacotes)}
      />
    </main>
  );
}
