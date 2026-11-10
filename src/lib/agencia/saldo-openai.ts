import { createClient } from "@/lib/supabase/server";
import { saldoOpenAI, type SaldoOpenAI } from "./financeiro";

// Saldo estimado da OpenAI: os créditos lançados nas recargas menos o que as
// gerações já gastaram. A soma das gerações é feita no banco
// (custo_total_geracoes_usd), para não trazer todas as linhas.
//
// O menu do sócio chama isto em toda tela, então nunca derruba a página: sem o
// número, devolve nulo e o menu continua de pé.
export async function lerSaldoOpenAI(): Promise<SaldoOpenAI | null> {
  try {
    const supabase = await createClient();
    const [{ data: recargas, error: erroRecargas }, { data: gasto, error: erroGasto }] = await Promise.all([
      supabase.from("gastos").select("credito_usd").eq("categoria", "openai").not("credito_usd", "is", null),
      supabase.rpc("custo_total_geracoes_usd"),
    ]);
    if (erroRecargas || erroGasto) {
      console.error("[financeiro] erro ao ler o saldo da OpenAI:", erroRecargas ?? erroGasto);
      return null;
    }
    return saldoOpenAI(
      (recargas ?? []).map((r) => r.credito_usd as number | string | null),
      Number(gasto ?? 0),
    );
  } catch (e) {
    console.error("[financeiro] erro ao ler o saldo da OpenAI:", e);
    return null;
  }
}
