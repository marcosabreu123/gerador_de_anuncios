import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hojeSP } from "@/lib/datas";
import { imagensDisponiveis, montarLinhas, precisaAtencao, ultimoPlano } from "./cobrancas";
import type { Pacote, Pagamento } from "./types";

// Saldo de imagens do cliente. Substitui o sistema de créditos do modelo
// antigo: lá o crédito era do usuário logado (o próprio lojista); aqui o
// saldo é do CLIENTE atendido, e quem opera é o sócio/designer.

export const PACOTE_ENTRADA = {
  nome: "Pacote 10 imagens",
  qtdImagens: 10,
  valorCentavos: 3490,
} as const;

// Consome 1 imagem do pacote ativo que vence antes (o plano antes do avulso;
// no empate, o mais antigo). Retorna o saldo restante daquele pacote, ou -1 se
// não há pacote com saldo. Atômico via função SQL — duas entregas simultâneas
// não podem consumir o mesmo último crédito.
//
// Client admin porque quem debita é sempre o worker da fila, que roda sem
// sessão de usuário.
export async function consumirImagemComoWorker(clienteId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("consumir_imagem_pacote", { p_cliente: clienteId });
  if (error) {
    console.error("[pacotes] erro ao consumir imagem (worker):", error);
    throw new Error("Falha ao consumir imagem do pacote.");
  }
  return typeof data === "number" ? data : -1;
}

// Estorno: a peça não foi entregue, então não pode ser cobrada do pacote.
// Best-effort — loga e segue, como o estorno de crédito do modelo antigo.
export async function devolverImagem(clienteId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.rpc("devolver_imagem_pacote", { p_cliente: clienteId });
  } catch (e) {
    console.error("[pacotes] erro ao devolver imagem:", e);
  }
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

// Quantos clientes pedem ação na cobrança: o número ao lado de "Cobranças" no
// menu do sócio. Roda em toda tela, então lê só o necessário e nunca derruba a
// página: sem o número, o menu continua de pé.
export async function contarAlertasCobranca(): Promise<number> {
  try {
    const supabase = await createClient();
    const [{ data: clientes }, { data: planos }, { data: abertos }] = await Promise.all([
      supabase.from("clientes").select("id, nome, nicho").eq("ativo", true),
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
