import { createClient } from "@/lib/supabase/server";

// Débito atômico de 1 crédito via função SQL (security definer).
// Retorna o novo saldo, ou -1 se não havia saldo.
export async function debitarCredito(userId: string, motivo: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("debitar_credito", {
    p_user: userId,
    p_motivo: motivo,
  });
  if (error) {
    console.error("[credits] erro no débito:", error);
    throw new Error("Falha ao debitar crédito.");
  }
  return typeof data === "number" ? data : -1;
}

// Estorna 1 crédito (ex.: geração falhou depois de debitar).
export async function estornarCredito(userId: string, motivo: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("estornar_credito", {
    p_user: userId,
    p_motivo: motivo,
  });
  // Estorno é best-effort; loga mas não quebra o fluxo.
  if (error) console.error("[credits] erro no estorno:", error);
}
