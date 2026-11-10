import { requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PainelFinanceiro from "@/components/PainelFinanceiro";
import { entradasDosPagamentos, mesDoEndereco, type Gasto } from "@/lib/agencia/financeiro";
import { lerSaldoOpenAI } from "@/lib/agencia/saldo-openai";
import { hojeSP } from "@/lib/datas";

// O caixa da agência. Só sócio, como tudo que mostra dinheiro. Aqui só se lê o
// banco: as contas e a tela ficam no PainelFinanceiro.
export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireSocio();
  const { mes: mesPedido } = await searchParams;
  const hoje = hojeSP();
  const supabase = await createClient();

  // Tudo, de todos os meses: o "Desde o início" e o ano somam por cima disto. Para
  // uma agência, são poucas linhas.
  const [{ data: gastosRaw }, { data: pagamentos }, { data: clientes }, { data: pacotes }, saldo] = await Promise.all([
    supabase
      .from("gastos")
      .select("id, dia, categoria, descricao, valor_centavos, credito_usd, registrado_por, created_at")
      .order("dia", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("pagamentos")
      .select("id, cliente_id, pacote_id, valor_centavos, metodo, status, pago_em")
      .eq("status", "confirmado"),
    supabase.from("clientes").select("id, nome, em_teste"),
    supabase.from("pacotes").select("id, nome"),
    lerSaldoOpenAI(),
  ]);

  // O banco devolve numeric como texto: o dólar vira número aqui.
  const gastos = ((gastosRaw ?? []) as Gasto[]).map((g) => ({
    ...g,
    credito_usd: g.credito_usd === null ? null : Number(g.credito_usd),
  }));
  const entradas = entradasDosPagamentos(
    pagamentos ?? [],
    clientes ?? [],
    new Map((pacotes ?? []).map((p) => [p.id, p.nome])),
  );

  return (
    <PainelFinanceiro mes={mesDoEndereco(mesPedido, hoje)} hoje={hoje} entradas={entradas} gastos={gastos} saldo={saldo} />
  );
}
