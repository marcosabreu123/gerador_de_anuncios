import Link from "next/link";
import { notFound } from "next/navigation";
import { ehSocio, requireOperador } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AgenciaHeader from "@/components/AgenciaHeader";
import PecasDoPedido from "@/components/PecasDoPedido";
import { formatarBRL, type Cliente, type Peca, type Pedido } from "@/lib/agencia/types";

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perfil } = await requireOperador();
  const supabase = await createClient();

  const { data: pedidoRaw } = await supabase.from("pedidos").select("*").eq("id", id).maybeSingle();
  if (!pedidoRaw) notFound();
  const pedido = pedidoRaw as Pedido;

  const [{ data: clienteRaw }, { data: pecasRaw }, { data: geracoesRaw }] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", pedido.cliente_id).maybeSingle(),
    supabase.from("pecas").select("*").eq("pedido_id", id).order("ordem"),
    supabase.from("geracoes").select("custo_brl").eq("pedido_id", id),
  ]);

  const cliente = clienteRaw as Cliente | null;
  const pecas = (pecasRaw ?? []) as Peca[];

  // Custo real deste lote, incluindo tentativas que falharam.
  const custoLote = (geracoesRaw ?? []).reduce((s, g) => s + Number(g.custo_brl ?? 0), 0);
  const entregues = pecas.filter((p) => p.status === "gerada" || p.status === "aprovada").length;

  return (
    <>
      <AgenciaHeader nome={perfil.nome ?? perfil.email} papel={perfil.papel} />
      <main className="app-shell py-6 flex flex-col gap-4">
        <div>
          {cliente && (
            <Link href={`/clientes/${cliente.id}`} className="text-xs text-[var(--muted)] underline">
              ← {cliente.nome}
            </Link>
          )}
          <h1 className="text-2xl font-bold tracking-tight mt-1">{pedido.titulo ?? "Pedido"}</h1>
          <p className="text-sm text-[var(--muted)]">
            {entregues} de {pecas.length} peça(s) pronta(s)
            {ehSocio(perfil) && ` · custo do lote ${formatarBRL(custoLote)}`}
          </p>
        </div>

        {pedido.pedido_original && (
          <details className="card p-3">
            <summary className="text-sm font-semibold cursor-pointer">Pedido original</summary>
            <p className="text-sm text-[var(--muted)] mt-2 whitespace-pre-wrap">{pedido.pedido_original}</p>
          </details>
        )}

        {pecas.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="font-semibold">Nenhuma peça neste pedido</p>
            <p className="text-sm text-[var(--muted)] mt-1">
              O pedido foi registrado, mas nada chegou a ser produzido.
            </p>
          </div>
        ) : (
          <PecasDoPedido pecas={pecas} pedidoId={id} />
        )}
      </main>
    </>
  );
}
