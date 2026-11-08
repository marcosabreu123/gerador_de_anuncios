import { notFound } from "next/navigation";
import { after } from "next/server";
import { ehSocio, requireOperador } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import NovaGeracaoForm from "@/components/NovaGeracaoForm";
import { Avatar, CabecalhoPagina } from "@/components/ui";
import { leituraEmDia } from "@/lib/agencia/leitura-referencias";
import { saldoDoCliente } from "@/lib/agencia/pacotes";
import { TIPOS_REFERENCIA, type BrandKit, type Cliente, type Referencia } from "@/lib/agencia/types";

// Folga para a leitura das referências terminar depois que a tela já abriu.
export const maxDuration = 60;

export default async function NovaGeracaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perfil } = await requireOperador();
  const supabase = await createClient();

  const { data: clienteRaw } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (!clienteRaw) notFound();
  const cliente = clienteRaw as Cliente;

  const [{ data: brandKitRaw }, { data: referenciasRaw }, saldo] = await Promise.all([
    supabase.from("brand_kits").select("*").eq("cliente_id", id).maybeSingle(),
    supabase.from("referencias").select("*").eq("cliente_id", id).order("created_at", { ascending: false }),
    saldoDoCliente(id),
  ]);

  const brandKit = (brandKitRaw as BrandKit) ?? null;
  const referencias = (referenciasRaw ?? []) as Referencia[];

  // Enquanto o operador escreve o pedido, a IA relê as referências se elas mudaram.
  // Assim a sugestão e a arte já encontram a leitura pronta, sem ninguém esperar.
  after(() => leituraEmDia(cliente, brandKit, referencias));

  // Mostra ao operador o que o agente vai realmente considerar. Sem isso ele
  // gera no escuro e só descobre no resultado que faltava a logo.
  const materiais = (["produto", "logo", "referencia_visual"] as const).map((tipo) => ({
    tipo,
    label: TIPOS_REFERENCIA[tipo].label,
    // Arte aprovada também serve de referência de estilo (ver gerar-peca.ts).
    tem: referencias.some(
      (r) => r.tipo === tipo || (tipo === "referencia_visual" && r.tipo === "arte_aprovada"),
    ),
  }));

  // Logo de parceiro só vai quando o pedido cita o nome: a lista diz isso ao operador.
  const parceiros = referencias
    .filter((r) => r.tipo === "logo_parceiro" && r.descricao?.trim())
    .map((r) => ({ tipo: `parceiro-${r.id}`, label: `Logo ${r.descricao!.trim()}, se o pedido citar`, tem: true }));

  const semIdentidade = !brandKit?.estilo_visual && !brandKit?.cores_primarias;

  return (
    <main className="pagina flex flex-col gap-6">
      <CabecalhoPagina
        voltar={{ href: `/clientes/${id}`, rotulo: cliente.nome }}
        inicio={
          <Avatar nome={cliente.nome} src={referencias.find((r) => r.tipo === "logo")?.url} tamanho={44} />
        }
        titulo="Nova geração"
        descricao={cliente.nicho ?? "Nicho não informado"}
      />

      <NovaGeracaoForm
        clienteId={id}
        saldoDisponivel={saldo.disponivel}
        ehSocio={ehSocio(perfil)}
        fotosProduto={referencias.filter((r) => r.tipo === "produto")}
        materiais={[...materiais, ...parceiros, { tipo: "identidade", label: "Identidade visual", tem: !semIdentidade }]}
      />
    </main>
  );
}
