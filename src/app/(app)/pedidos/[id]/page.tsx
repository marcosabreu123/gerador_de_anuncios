import Link from "next/link";
import { notFound } from "next/navigation";
import { Layers, RotateCcw } from "lucide-react";
import { ehSocio, requireOperador } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import PecasDoPedido from "@/components/PecasDoPedido";
import { CabecalhoPagina, EstadoVazio, SeloStatus, TituloCard } from "@/components/ui";
import { DEFINICAO_OBJETIVO, pedidoDosCampos } from "@/lib/agencia/objetivos";
import { saldoDoCliente } from "@/lib/agencia/pacotes";
import { formatarBRL, type BriefingPecaManual, type Cliente, type Peca, type Pedido } from "@/lib/agencia/types";

export default async function PedidoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perfil } = await requireOperador();
  const supabase = await createClient();
  const socio = ehSocio(perfil);

  const { data: pedidoRaw } = await supabase.from("pedidos").select("*").eq("id", id).maybeSingle();
  if (!pedidoRaw) notFound();
  const pedido = pedidoRaw as Pedido;

  const [{ data: clienteRaw }, { data: pecasRaw }, { data: geracoesRaw }, saldo] = await Promise.all([
    supabase.from("clientes").select("*").eq("id", pedido.cliente_id).maybeSingle(),
    supabase.from("pecas").select("*").eq("pedido_id", id).order("ordem"),
    // Custo é dado de gestão: o colaborador nem consulta.
    socio ? supabase.from("geracoes").select("custo_brl, peca_id").eq("pedido_id", id) : { data: [] },
    saldoDoCliente(pedido.cliente_id),
  ]);

  const cliente = clienteRaw as Cliente | null;
  const pecas = (pecasRaw ?? []) as Peca[];

  // Custo real deste lote, incluindo tentativas que falharam. Por peça, é todo o
  // gasto até a aprovação: variações, ajustes e falhas dela.
  const geracoes = (geracoesRaw ?? []) as { custo_brl: number | null; peca_id: string | null }[];
  const custoLote = geracoes.reduce((s, g) => s + Number(g.custo_brl ?? 0), 0);
  const custoPorPeca: Record<string, number> = {};
  for (const g of geracoes) {
    if (g.peca_id) custoPorPeca[g.peca_id] = (custoPorPeca[g.peca_id] ?? 0) + Number(g.custo_brl ?? 0);
  }
  const entregues = pecas.filter((p) => p.status === "gerada" || p.status === "aprovada").length;
  const aprovadas = pecas.filter((p) => p.status === "aprovada").length;

  // Objetivo e campos ficam no briefing de cada peça; os da primeira são os do pedido.
  const primeiro = (pecas[0]?.briefing ?? null) as BriefingPecaManual | null;
  const objetivo = primeiro?.objetivo && primeiro.objetivo !== "livre" ? DEFINICAO_OBJETIVO[primeiro.objetivo] : null;
  const obrigatorios = primeiro?.obrigatorios ?? [];
  // Pedido feito só pelos campos: o texto foi montado com eles e repetiria a lista.
  const soCampos =
    obrigatorios.length > 0 && pedido.pedido_original === pedidoDosCampos(primeiro?.objetivo ?? "livre", obrigatorios);

  return (
    <main className="pagina flex flex-col gap-6">
      <CabecalhoPagina
        voltar={cliente ? { href: `/clientes/${cliente.id}`, rotulo: cliente.nome } : undefined}
        titulo={pedido.titulo ?? "Pedido"}
        descricao={`${entregues} de ${pecas.length} ${pecas.length === 1 ? "peça pronta" : "peças prontas"}`}
        acoes={
          <>
            <SeloStatus status={pedido.status} />
            {/* Abre a nova geração com o texto e os controles deste pedido, para mudar
                um trecho sem reescrever o resto. Cliente arquivado não produz. */}
            {cliente?.ativo && pecas.length > 0 && (
              <Link href={`/clientes/${cliente.id}/nova-geracao?repetir=${pedido.id}`} className="btn btn-outline btn-sm">
                <RotateCcw size={14} aria-hidden="true" />
                Repetir pedido
              </Link>
            )}
          </>
        }
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
          <PecasDoPedido
            pecas={pecas}
            pedidoId={id}
            ehSocio={socio}
            creditos={saldo.disponivel}
            emTeste={saldo.emTeste}
            custoPorPeca={socio ? custoPorPeca : undefined}
          />
        )}

        <aside className="flex flex-col gap-4 xl:sticky xl:top-6">
          {pedido.pedido_original && (
            <section className="card p-5 flex flex-col gap-3">
              <TituloCard titulo="Pedido original" descricao={objetivo ? `Objetivo: ${objetivo.rotulo}` : undefined} />
              {/* Os campos entram na arte exatamente assim: ficam à vista para conferir. */}
              {obrigatorios.length > 0 && (
                <dl className="flex flex-col gap-2">
                  {obrigatorios.map((t) => (
                    <div key={t.campo}>
                      <dt className="text-[13px] font-medium">{t.rotulo}</dt>
                      <dd className="text-[13px] text-[var(--muted)] whitespace-pre-wrap">{t.valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {!soCampos && <p className="text-sm text-[var(--muted)] whitespace-pre-wrap">{pedido.pedido_original}</p>}
            </section>
          )}
          {socio && (
            <section className="card p-5">
              <p className="text-[13px] text-[var(--muted)]">Custo do lote</p>
              <p className="text-2xl font-semibold tracking-tight mt-1">{formatarBRL(custoLote)}</p>
              <p className="text-xs text-[var(--muted)] mt-1.5">
                {aprovadas > 0
                  ? `${formatarBRL(custoLote / aprovadas)} por arte aprovada, contando variações, ajustes e falhas.`
                  : "Inclui tentativas que falharam. Ainda sem arte aprovada."}
              </p>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}
