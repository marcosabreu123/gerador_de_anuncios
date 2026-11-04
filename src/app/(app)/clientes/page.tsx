import { requireOperador } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ListaClientes, { type ClienteCard } from "@/components/ListaClientes";
import { mesAtual } from "@/lib/agencia/relatorio";
import type { Cliente } from "@/lib/agencia/types";

// Acessível a sócio E colaborador: é a tela de produção. O que muda por
// papel é o que aparece dentro do cliente (financeiro só para sócio).
export default async function ClientesPage() {
  await requireOperador();
  const supabase = await createClient();
  const periodo = mesAtual();

  // Tudo em consultas agregadas em vez de uma por card — com 100 clientes,
  // uma consulta por card deixaria a página inutilizável.
  const [
    { data: clientesRaw },
    { data: pacotes },
    { data: pecas },
    { data: pedidosAtivos },
    { data: logos },
  ] = await Promise.all([
    supabase.from("clientes").select("*").order("ativo", { ascending: false }).order("nome"),
    supabase.from("pacotes").select("cliente_id, qtd_imagens, qtd_usadas, status, validade"),
    supabase
      .from("pecas")
      .select("cliente_id, status")
      .gte("created_at", periodo.inicio)
      .lte("created_at", periodo.fim),
    supabase.from("pedidos").select("cliente_id").in("status", ["processando", "planejado"]),
    supabase.from("referencias").select("cliente_id, url").eq("tipo", "logo"),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);

  const saldoPorCliente = new Map<string, number>();
  for (const p of pacotes ?? []) {
    if (p.status !== "ativo") continue;
    if (p.validade && p.validade < hoje) continue;
    saldoPorCliente.set(
      p.cliente_id,
      (saldoPorCliente.get(p.cliente_id) ?? 0) + (p.qtd_imagens - p.qtd_usadas),
    );
  }

  const pecasPorCliente = new Map<string, number>();
  for (const p of pecas ?? []) {
    if (p.status !== "gerada" && p.status !== "aprovada") continue;
    pecasPorCliente.set(p.cliente_id, (pecasPorCliente.get(p.cliente_id) ?? 0) + 1);
  }

  const emAndamento = new Set((pedidosAtivos ?? []).map((p) => p.cliente_id));
  const logoPorCliente = new Map((logos ?? []).map((l) => [l.cliente_id, l.url as string]));

  const cards: ClienteCard[] = ((clientesRaw ?? []) as Cliente[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    nicho: c.nicho,
    ativo: c.ativo,
    logo: logoPorCliente.get(c.id) ?? null,
    saldo: saldoPorCliente.get(c.id) ?? 0,
    pecasNoMes: pecasPorCliente.get(c.id) ?? 0,
    temPedidoEmAndamento: emAndamento.has(c.id),
  }));

  return (
    <main className="pagina flex flex-col gap-6">
      <ListaClientes clientes={cards} />
    </main>
  );
}
