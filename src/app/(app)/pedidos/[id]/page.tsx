import { notFound } from "next/navigation";
import { Layers } from "lucide-react";
import { ehSocio, requireOperador } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PecasDoPedido from "@/components/PecasDoPedido";
import { CabecalhoPagina, EstadoVazio, SeloStatus, TituloCard } from "@/components/ui";
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
    <main className="pagina flex flex-col gap-6">
      <CabecalhoPagina
        voltar={cliente ? { href: `/clientes/${cliente.id}`, rotulo: cliente.nome } : undefined}
        titulo={pedido.titulo ?? "Pedido"}
        descricao={`${entregues} de ${pecas.length} ${pecas.length === 1 ? "peça pronta" : "peças prontas"}`}
        acoes={<SeloStatus status={pedido.status} />}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        {pecas.length === 0 ? (
          <div className="card">
            <EstadoVazio
              icone={Layers}
              titulo="Nenhuma peça neste pedido"
              descricao="O pedido foi registrado, mas nada chegou a ser produzido."
            />
          </div>
        ) : (
          <PecasDoPedido pecas={pecas} pedidoId={id} />
        )}

        <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
          {pedido.pedido_original && (
            <section className="card p-5 flex flex-col gap-2">
              <TituloCard titulo="Pedido original" />
              <p className="text-sm text-[var(--muted)] whitespace-pre-wrap">{pedido.pedido_original}</p>
            </section>
          )}
          {ehSocio(perfil) && (
            <section className="card p-5">
              <p className="text-[13px] text-[var(--muted)]">Custo do lote</p>
              <p className="text-2xl font-semibold tracking-tight mt-1">{formatarBRL(custoLote)}</p>
              <p className="text-xs text-[var(--muted)] mt-1.5">Inclui tentativas que falharam.</p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
