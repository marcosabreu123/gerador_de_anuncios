import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatarDia, hojeSP } from "@/lib/datas";
import { imagensDisponiveis, montarLinhas, precisaAtencao, ultimoPlano } from "./cobrancas";
import type { Pacote, Pagamento } from "./types";

// Créditos do cliente. 1 crédito = 1 arte aprovada: gerar, variar, ajustar e
// mudar de formato não gastam crédito. Todo o gasto de API até a aprovação sai da
// margem da agência e aparece no painel como custo por arte aprovada.
//
// No banco o crédito ainda se chama imagem (qtd_imagens, qtd_usadas): mudar o nome
// das colunas não mudaria nada para quem usa.

export const PACOTE_ENTRADA = {
  nome: "Pacote 10 créditos",
  qtdImagens: 10,
  valorCentavos: 3490,
} as const;

// Debita 1 crédito do pacote ativo que vence antes (o plano antes do avulso; no
// empate, o mais antigo). Retorna o que sobrou naquele pacote, ou -1 se o cliente
// não tem crédito. Atômico via função SQL: duas aprovações simultâneas não podem
// gastar o mesmo último crédito.
//
// Client admin porque a função só aceita o service role (schema-cobrancas.sql):
// quem debita é sempre o servidor, nunca o navegador.
export async function debitarCredito(clienteId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("consumir_imagem_pacote", { p_cliente: clienteId });
  if (error) {
    console.error("[pacotes] erro ao debitar crédito:", error);
    throw new Error("Falha ao debitar o crédito do cliente.");
  }
  return typeof data === "number" ? data : -1;
}

export interface SaldoCliente {
  disponivel: number;
  total: number;
  usado: number;
  // Do mais novo para o mais antigo.
  pacotes: Pacote[];
  hoje: string;
  // O plano que diz até quando o cliente está coberto (ver ultimoPlano).
  plano: Pacote | null;
  // Vencimento do último plano, quando já passou. É o que bloqueia a geração
  // quando o cliente não tem outro saldo.
  planoVencidoEm: string | null;
}

export async function saldoDoCliente(clienteId: string): Promise<SaldoCliente> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pacotes")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });

  const pacotes = (data ?? []) as Pacote[];
  const hoje = hojeSP();
  // Cancelado não foi vendido: não entra no comprado nem no usado.
  const vendidos = pacotes.filter((p) => p.status !== "cancelado");
  const plano = ultimoPlano(pacotes);

  return {
    disponivel: imagensDisponiveis(pacotes, hoje),
    total: vendidos.reduce((soma, p) => soma + p.qtd_imagens, 0),
    usado: vendidos.reduce((soma, p) => soma + p.qtd_usadas, 0),
    pacotes,
    hoje,
    plano,
    planoVencidoEm: plano?.validade && plano.validade < hoje ? plano.validade : null,
  };
}

// Por que a produção não pode começar, ou nulo quando pode. Gerar não gasta
// crédito, mas sem nenhum a arte não teria como ser aprovada: a API seria gasta
// num trabalho que o cliente não pagou.
export function bloqueioDeGeracao(saldo: Pick<SaldoCliente, "disponivel" | "planoVencidoEm">): string | null {
  if (saldo.disponivel > 0) return null;
  // Plano vencido é o motivo mais comum: dizer isso poupa o operador de procurar
  // por que os créditos sumiram.
  return saldo.planoVencidoEm
    ? `O plano deste cliente venceu em ${formatarDia(saldo.planoVencidoEm)}. Renove para gerar.`
    : "O cliente está sem crédito. Venda um pacote ou plano para gerar.";
}

// Quantos clientes pedem ação na cobrança: o número ao lado de "Cobranças" no
// menu do sócio. Roda em toda tela, então lê só o necessário e nunca derruba a
// página: sem o número, o menu continua de pé. Cliente em teste não é cobrado.
export async function contarAlertasCobranca(): Promise<number> {
  try {
    const supabase = await createClient();
    const [{ data: clientes }, { data: planos }, { data: abertos }] = await Promise.all([
      supabase.from("clientes").select("id, nome, nicho").eq("ativo", true).eq("em_teste", false),
      supabase.from("pacotes").select("*").eq("tipo", "tempo").neq("status", "cancelado"),
      supabase.from("pagamentos").select("*").eq("status", "pendente"),
    ]);
    const linhas = montarLinhas({
      clientes: clientes ?? [],
      pacotes: (planos ?? []) as Pacote[],
      pagamentos: (abertos ?? []) as Pagamento[],
      logos: new Map(),
      hoje: hojeSP(),
    });
    return linhas.filter((l) => precisaAtencao(l)).length;
  } catch (e) {
    console.error("[pacotes] erro ao contar alertas de cobrança:", e);
    return 0;
  }
}
