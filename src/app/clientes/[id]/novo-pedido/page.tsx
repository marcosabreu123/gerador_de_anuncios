import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AgenciaHeader from "@/components/AgenciaHeader";
import NovoPedidoForm from "@/components/NovoPedidoForm";
import { saldoDoCliente } from "@/lib/agencia/pacotes";
import type { BrandKit, Cliente } from "@/lib/agencia/types";

export default async function NovoPedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perfil } = await requireUser();
  const supabase = await createClient();

  const { data: clienteRaw } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (!clienteRaw) notFound();
  const cliente = clienteRaw as Cliente;

  const [{ data: brandKitRaw }, saldo] = await Promise.all([
    supabase.from("brand_kits").select("*").eq("cliente_id", id).maybeSingle(),
    saldoDoCliente(id),
  ]);
  const brandKit = (brandKitRaw as BrandKit) ?? null;

  // Sem identidade cadastrada o agente até produz, mas produz genérico —
  // vale avisar antes de gastar, não depois.
  const semIdentidade = !brandKit?.estilo_visual && !brandKit?.cores_primarias;

  return (
    <>
      <AgenciaHeader nome={perfil.nome ?? perfil.email} />
      <main className="app-shell py-6 flex flex-col gap-4">
        <div>
          <Link href={`/clientes/${id}`} className="text-xs text-[var(--muted)] underline">
            ← {cliente.nome}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Novo pedido</h1>
        </div>

        {semIdentidade && (
          <div className="card p-4 border-l-4 border-l-[var(--accent)]">
            <p className="text-sm font-semibold">Esse cliente ainda não tem identidade visual cadastrada</p>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              As artes vão sair genéricas.{" "}
              <Link href={`/clientes/${id}`} className="underline">
                Preencher agora
              </Link>{" "}
              leva um minuto e melhora bastante o resultado.
            </p>
          </div>
        )}

        <NovoPedidoForm clienteId={id} saldoDisponivel={saldo.disponivel} />
      </main>
    </>
  );
}
