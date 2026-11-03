import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Pacote } from "./types";

// Saldo de imagens do cliente. Substitui o sistema de créditos do modelo
// antigo: lá o crédito era do usuário logado (o próprio lojista); aqui o
// saldo é do CLIENTE atendido, e quem opera é o sócio/designer.

export const PACOTE_ENTRADA = {
  nome: "Pacote 10 imagens",
  qtdImagens: 10,
  valorCentavos: 3490,
} as const;

// Consome 1 imagem do pacote ativo mais antigo do cliente (FIFO). Retorna o
// saldo restante, ou -1 se não há pacote com saldo. Atômico via função SQL —
// duas entregas simultâneas não podem consumir o mesmo último crédito.
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
  pacotes: Pacote[];
}

export async function saldoDoCliente(clienteId: string): Promise<SaldoCliente> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pacotes")
    .select("*")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false });

  const pacotes = (data ?? []) as Pacote[];
  const ativos = pacotes.filter(
    (p) => p.status === "ativo" && (!p.validade || p.validade >= new Date().toISOString().slice(0, 10)),
  );

  const disponivel = ativos.reduce((soma, p) => soma + (p.qtd_imagens - p.qtd_usadas), 0);
  const total = pacotes.reduce((soma, p) => soma + p.qtd_imagens, 0);
  const usado = pacotes.reduce((soma, p) => soma + p.qtd_usadas, 0);

  return { disponivel, total, usado, pacotes };
}
