import { hojeSP } from "@/lib/datas";
import type { Pagamento } from "./types";

// Financeiro da agência: o dinheiro que entra (pagamentos dos clientes) e o que
// sai (gastos lançados pelos sócios). Ver supabase/schema-financeiro.sql.
//
// É caixa: conta o dia em que o dinheiro entrou ou saiu. O Painel mostra outra
// coisa, o custo de geração de cada arte. A recarga da OpenAI já paga essas
// gerações, então os dois números nunca se somam.
//
// Só funções puras: a página lê do banco e o formulário usa as categorias no
// navegador.

export const CATEGORIAS_GASTO = {
  openai: "OpenAI/ChatGPT",
  funcionario: "Funcionário",
  ferramentas: "Ferramentas",
  impostos: "Impostos e taxas",
  outros: "Outros",
} as const;

export type CategoriaGasto = keyof typeof CATEGORIAS_GASTO;

export function categoriaValida(valor: unknown): valor is CategoriaGasto {
  // hasOwn, e não "in": "toString" in {} é verdadeiro.
  return typeof valor === "string" && Object.hasOwn(CATEGORIAS_GASTO, valor);
}

export interface Gasto {
  id: string;
  // Dia em que o dinheiro saiu (AAAA-MM-DD).
  dia: string;
  categoria: CategoriaGasto;
  descricao: string | null;
  valor_centavos: number;
  // Só na recarga da OpenAI: quantos dólares de crédito entraram lá.
  credito_usd: number | null;
  registrado_por: string | null;
  created_at: string;
}

// Descrição longa vira parágrafo na lista. O que importa cabe em uma linha.
export const MAX_DESCRICAO_GASTO = 160;

// ---------- Mês escolhido ----------

const NOME_DO_MES = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });

export interface MesFinanceiro {
  chave: string; // AAAA-MM
  ano: string;
  inicio: string; // AAAA-MM-DD
  fim: string; // AAAA-MM-DD
  rotulo: string; // "novembro de 2026"
  anterior: string; // AAAA-MM
  // Nulo no mês de hoje: o futuro ainda não tem dinheiro.
  seguinte: string | null;
}

function chaveDoMes(ano: number, mes: number): string {
  const data = new Date(Date.UTC(ano, mes - 1, 1));
  return `${data.getUTCFullYear()}-${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

// O mês do endereço (?mes=2026-10). Fora do formato ou depois de hoje, vale o
// mês de hoje em São Paulo.
export function mesDoEndereco(valor: string | undefined, hoje: string = hojeSP()): MesFinanceiro {
  const mesDeHoje = hoje.slice(0, 7);
  const pedido = /^\d{4}-(0[1-9]|1[0-2])$/.test(valor ?? "") && valor! <= mesDeHoje ? valor! : mesDeHoje;
  const [ano, mes] = pedido.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const seguinte = chaveDoMes(ano, mes + 1);
  return {
    chave: pedido,
    ano: String(ano),
    inicio: `${pedido}-01`,
    fim: `${pedido}-${String(ultimoDia).padStart(2, "0")}`,
    rotulo: NOME_DO_MES.format(new Date(Date.UTC(ano, mes - 1, 1))),
    anterior: chaveDoMes(ano, mes - 1),
    seguinte: seguinte <= mesDeHoje ? seguinte : null,
  };
}

// ---------- Entradas ----------

export interface Entrada {
  id: string;
  clienteId: string;
  cliente: string;
  descricao: string;
  // Dia de São Paulo em que foi pago.
  dia: string;
  valorCentavos: number;
  metodo: string;
}

// O que entrou: pagamentos confirmados. Cliente em teste não paga, então o que
// estiver no nome dele fica de fora, como no Painel e nas cobranças.
export function entradasDosPagamentos(
  pagamentos: Pick<Pagamento, "id" | "cliente_id" | "pacote_id" | "valor_centavos" | "metodo" | "status" | "pago_em">[],
  clientes: { id: string; nome: string; em_teste: boolean | null }[],
  nomeDoPacote: Map<string, string> = new Map(),
): Entrada[] {
  const cliente = new Map(clientes.map((c) => [c.id, c]));
  return pagamentos
    .filter((pg) => pg.status === "confirmado" && pg.pago_em && !cliente.get(pg.cliente_id)?.em_teste)
    .map((pg) => ({
      id: pg.id,
      clienteId: pg.cliente_id,
      cliente: cliente.get(pg.cliente_id)?.nome ?? "Cliente",
      descricao: (pg.pacote_id && nomeDoPacote.get(pg.pacote_id)) || "Pagamento",
      dia: hojeSP(new Date(pg.pago_em!)),
      valorCentavos: pg.valor_centavos,
      metodo: pg.metodo,
    }))
    .sort((a, b) => b.dia.localeCompare(a.dia));
}

// ---------- Resumos ----------

export interface ResumoCaixa {
  entrouCentavos: number;
  saiuCentavos: number;
  resultadoCentavos: number;
}

const noPeriodo = (dia: string, de?: string, ate?: string) => (!de || dia >= de) && (!ate || dia <= ate);

// Sem período, conta desde o começo.
export function resumoDoCaixa(
  entradas: Pick<Entrada, "dia" | "valorCentavos">[],
  gastos: Pick<Gasto, "dia" | "valor_centavos">[],
  de?: string,
  ate?: string,
): ResumoCaixa {
  const entrou = entradas.filter((e) => noPeriodo(e.dia, de, ate)).reduce((soma, e) => soma + e.valorCentavos, 0);
  const saiu = gastos.filter((g) => noPeriodo(g.dia, de, ate)).reduce((soma, g) => soma + g.valor_centavos, 0);
  return { entrouCentavos: entrou, saiuCentavos: saiu, resultadoCentavos: entrou - saiu };
}

export function gastosPorCategoria(
  gastos: Pick<Gasto, "dia" | "categoria" | "valor_centavos">[],
  de?: string,
  ate?: string,
): Record<CategoriaGasto, number> {
  const soma = Object.fromEntries(Object.keys(CATEGORIAS_GASTO).map((c) => [c, 0])) as Record<CategoriaGasto, number>;
  for (const g of gastos) {
    if (noPeriodo(g.dia, de, ate) && Object.hasOwn(soma, g.categoria)) soma[g.categoria] += g.valor_centavos;
  }
  return soma;
}

// ---------- Saldo da OpenAI ----------

// Abaixo disto o Financeiro e o menu avisam. Dá para umas poucas dezenas de artes.
export const SALDO_OPENAI_BAIXO_USD = 5;

export interface SaldoOpenAI {
  // Soma dos créditos lançados nas recargas.
  creditoUsd: number;
  // O que as gerações gastaram desde o começo, pela conta do app.
  gastoUsd: number;
  // Estimativa do que sobra lá. Nula enquanto nenhuma recarga tiver o crédito em dólar.
  saldoUsd: number | null;
  baixo: boolean;
  acabou: boolean;
}

export function saldoOpenAI(creditos: (number | string | null)[], gastoUsd: number): SaldoOpenAI {
  const creditoUsd = creditos.reduce<number>((soma, c) => soma + (Number(c) || 0), 0);
  const gasto = Number(gastoUsd) || 0;
  if (creditoUsd <= 0) return { creditoUsd: 0, gastoUsd: gasto, saldoUsd: null, baixo: false, acabou: false };
  const saldo = Math.round((creditoUsd - gasto) * 100) / 100;
  return {
    creditoUsd,
    gastoUsd: gasto,
    saldoUsd: saldo,
    baixo: saldo < SALDO_OPENAI_BAIXO_USD,
    acabou: saldo <= 0,
  };
}
