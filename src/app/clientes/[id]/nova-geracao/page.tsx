import Link from "next/link";
import { notFound } from "next/navigation";
import { ehSocio, requireOperador } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AgenciaHeader from "@/components/AgenciaHeader";
import NovaGeracaoForm from "@/components/NovaGeracaoForm";
import { saldoDoCliente } from "@/lib/agencia/pacotes";
import { TIPOS_REFERENCIA, type BrandKit, type Cliente, type Referencia } from "@/lib/agencia/types";

export default async function NovaGeracaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perfil } = await requireOperador();
  const supabase = await createClient();

  const { data: clienteRaw } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (!clienteRaw) notFound();
  const cliente = clienteRaw as Cliente;

  const [{ data: brandKitRaw }, { data: referenciasRaw }, saldo] = await Promise.all([
    supabase.from("brand_kits").select("*").eq("cliente_id", id).maybeSingle(),
    supabase.from("referencias").select("*").eq("cliente_id", id),
    saldoDoCliente(id),
  ]);

  const brandKit = (brandKitRaw as BrandKit) ?? null;
  const referencias = (referenciasRaw ?? []) as Referencia[];

  // Mostra ao operador o que o agente vai realmente considerar. Sem isso ele
  // gera no escuro e só descobre no resultado que faltava a logo.
  const materiais = (["produto", "logo", "referencia_visual"] as const).map((tipo) => ({
    tipo,
    label: TIPOS_REFERENCIA[tipo].label,
    tem: referencias.some((r) => r.tipo === tipo),
  }));

  const semIdentidade = !brandKit?.estilo_visual && !brandKit?.cores_primarias;

  return (
    <>
      <AgenciaHeader nome={perfil.nome ?? perfil.email} papel={perfil.papel} />
      <main className="app-shell py-6 flex flex-col gap-4">
        <div>
          <Link href={`/clientes/${id}`} className="text-xs text-[var(--muted)] underline">
            ← {cliente.nome}
          </Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Nova geração</h1>
          <p className="text-sm text-[var(--muted)]">{cliente.nicho ?? "nicho não informado"}</p>
        </div>

        <section className="card p-3">
          <p className="label mb-2">O agente vai usar</p>
          <div className="flex flex-wrap gap-2">
            {materiais.map((m) => (
              <span
                key={m.tipo}
                className={`badge ${m.tem ? "" : "opacity-50"}`}
                title={m.tem ? "Disponível" : "Não cadastrado"}
              >
                {m.tem ? "✓" : "—"} {m.label}
              </span>
            ))}
            <span className={`badge ${semIdentidade ? "opacity-50" : ""}`}>
              {semIdentidade ? "—" : "✓"} Identidade visual
            </span>
          </div>
          {semIdentidade && (
            <p className="text-xs text-[var(--muted)] mt-2">
              Sem identidade cadastrada as artes saem genéricas.{" "}
              <Link href={`/clientes/${id}`} className="underline">
                Preencher
              </Link>{" "}
              leva um minuto e muda bastante o resultado.
            </p>
          )}
        </section>

        <NovaGeracaoForm
          clienteId={id}
          saldoDisponivel={saldo.disponivel}
          ehSocio={ehSocio(perfil)}
        />
      </main>
    </>
  );
}
