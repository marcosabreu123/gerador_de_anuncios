import Link from "next/link";
import { notFound } from "next/navigation";
import { ehSocio, requireOperador } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AgenciaHeader from "@/components/AgenciaHeader";
import UploadMaterial from "@/components/UploadMaterial";
import { saldoDoCliente } from "@/lib/agencia/pacotes";
import {
  atualizarCliente,
  confirmarPagamento,
  removerReferencia,
  salvarBrandKit,
  venderPacote,
} from "../actions";
import {
  TIPOS_REFERENCIA,
  centavosParaBRL,
  type BrandKit,
  type Cliente,
  type Pagamento,
  type Peca,
  type Pedido,
  type Referencia,
  type TipoReferencia,
} from "@/lib/agencia/types";

export default async function ClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perfil } = await requireOperador();
  const supabase = await createClient();

  const { data: clienteRaw } = await supabase.from("clientes").select("*").eq("id", id).maybeSingle();
  if (!clienteRaw) notFound();
  const cliente = clienteRaw as Cliente;
  // Colaborador produz, mas não vê nem mexe em dinheiro: pacote vendido,
  // valor e pagamento são gestão. O saldo em imagens ele vê, porque é
  // informação operacional — precisa saber se pode gerar.
  const gestao = ehSocio(perfil);

  const [
    { data: brandKitRaw },
    { data: referenciasRaw },
    { data: pagamentosRaw },
    { data: pedidosRaw },
    { data: artesRaw },
    saldo,
  ] = await Promise.all([
    supabase.from("brand_kits").select("*").eq("cliente_id", id).maybeSingle(),
    supabase.from("referencias").select("*").eq("cliente_id", id).order("created_at", { ascending: false }),
    supabase.from("pagamentos").select("*").eq("cliente_id", id).order("created_at", { ascending: false }),
    supabase.from("pedidos").select("*").eq("cliente_id", id).order("created_at", { ascending: false }).limit(10),
    // Galeria do cliente: tudo que já foi entregue a ele. Antes isso só
    // existia dentro de cada pedido, então para ver o histórico de uma
    // empresa era preciso abrir pedido por pedido.
    supabase
      .from("pecas")
      .select("id, pedido_id, titulo, imagem_url, status, created_at")
      .eq("cliente_id", id)
      .not("imagem_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(18),
    saldoDoCliente(id),
  ]);

  const brandKit = (brandKitRaw as BrandKit) ?? null;
  const referencias = (referenciasRaw ?? []) as Referencia[];
  const pagamentos = (pagamentosRaw ?? []) as Pagamento[];
  const artes = (artesRaw ?? []) as Pick<Peca, "id" | "pedido_id" | "titulo" | "imagem_url" | "status" | "created_at">[];
  const pedidos = (pedidosRaw ?? []) as Pedido[];

  return (
    <>
      <AgenciaHeader nome={perfil.nome ?? perfil.email} papel={perfil.papel} />
      <main className="app-shell py-6 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <Link href="/clientes" className="text-xs text-[var(--muted)] underline">
              ← Clientes
            </Link>
            <h1 className="text-2xl font-bold tracking-tight mt-1">{cliente.nome}</h1>
            <p className="text-sm text-[var(--muted)]">{cliente.nicho ?? "Nicho não informado"}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge" title="Imagens disponíveis no pacote">
              {saldo.disponivel} img
            </span>
            <Link href={`/clientes/${id}/nova-geracao`} className="btn btn-primary">
              Novo pedido
            </Link>
          </div>
        </div>

        {saldo.disponivel === 0 && (
          <div className="card p-4 border-l-4 border-l-[var(--danger)]">
            <p className="font-semibold text-sm">Cliente sem saldo</p>
            <p className="text-sm text-[var(--muted)] mt-0.5">
              {gestao
                ? "Venda um pacote antes de produzir — ou gere mesmo assim, se ele já combinou o pagamento."
                : "Avise um sócio para lançar o pacote. Sem saldo, a geração fica bloqueada."}
            </p>
          </div>
        )}

        {/* ---------------- Galeria ---------------- */}
        {artes.length > 0 && (
          <section className="card p-4 flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">Artes deste cliente</h2>
              <span className="text-xs text-[var(--muted)]">{artes.length} mais recentes</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {artes.map((arte) => (
                <Link
                  key={arte.id}
                  href={`/pedidos/${arte.pedido_id}`}
                  className="relative block"
                  title={arte.titulo ?? "Arte"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={arte.imagem_url!}
                    alt={arte.titulo ?? "Arte"}
                    className="w-full aspect-square object-cover rounded-lg"
                  />
                  {arte.status === "aprovada" && (
                    <span
                      className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--success)]"
                      title="Aprovada"
                      aria-label="Aprovada"
                    />
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* ---------------- Pedidos ---------------- */}
        <section className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold">Pedidos recentes</h2>
          {pedidos.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Nenhum pedido ainda.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {pedidos.map((pedido) => (
                <li key={pedido.id}>
                  <Link
                    href={`/pedidos/${pedido.id}`}
                    className="flex items-center justify-between gap-3 bg-[var(--surface-muted)] rounded-xl px-3 py-2"
                  >
                    <span className="text-sm truncate">{pedido.titulo ?? "Pedido"}</span>
                    <span className="badge shrink-0">{pedido.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------- Identidade visual ---------------- */}
        <form action={salvarBrandKit} className="card p-4 flex flex-col gap-3">
          <input type="hidden" name="cliente_id" value={id} />
          <div>
            <h2 className="font-semibold">Identidade visual</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              É isso que faz o agente gerar no estilo desta empresa em vez de algo genérico.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="label">Cores primárias</span>
              <input name="cores_primarias" defaultValue={brandKit?.cores_primarias ?? ""} className="input" placeholder="Ex: vermelho #D32F2F e amarelo #FBC02D" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Cores secundárias</span>
              <input name="cores_secundarias" defaultValue={brandKit?.cores_secundarias ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Tipografia</span>
              <input name="tipografia" defaultValue={brandKit?.tipografia ?? ""} className="input" placeholder="Ex: sans-serif pesada, bem comercial" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Tom de voz</span>
              <input name="tom_de_voz" defaultValue={brandKit?.tom_de_voz ?? ""} className="input" placeholder="Ex: descontraído, direto, sem formalidade" />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="label">Estilo visual</span>
            <textarea name="estilo_visual" defaultValue={brandKit?.estilo_visual ?? ""} className="input min-h-[70px] resize-none" placeholder="Como as artes dessa marca têm que parecer." />
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="label">Regras obrigatórias (uma por linha)</span>
              <textarea
                name="regras_obrigatorias"
                defaultValue={(brandKit?.regras_obrigatorias ?? []).join("\n")}
                className="input min-h-[80px] resize-none"
                placeholder={"sempre mostrar o WhatsApp\nsempre usar a logo"}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Regras proibidas (uma por linha)</span>
              <textarea
                name="regras_proibidas"
                defaultValue={(brandKit?.regras_proibidas ?? []).join("\n")}
                className="input min-h-[80px] resize-none"
                placeholder={"nunca usar fundo roxo\nnunca mostrar concorrente"}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="label">WhatsApp</span>
              <input name="whatsapp" defaultValue={brandKit?.whatsapp ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Endereço</span>
              <input name="endereco" defaultValue={brandKit?.endereco ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Horário</span>
              <input name="horario_funcionamento" defaultValue={brandKit?.horario_funcionamento ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Instagram</span>
              <input name="instagram" defaultValue={brandKit?.instagram ?? ""} className="input" />
            </label>
          </div>

          <button type="submit" className="btn btn-primary self-start">
            Salvar identidade
          </button>
        </form>

        {/* ---------------- Referências ---------------- */}
        <section className="card p-4 flex flex-col gap-3">
          <div>
            <h2 className="font-semibold">Materiais do cliente</h2>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Logo e fotos entram na geração. Artes aprovadas viram padrão e reduzem retrabalho nos próximos pedidos.
            </p>
          </div>

          {referencias.length > 0 && (
            <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {referencias.map((ref) => (
                <li key={ref.id} className="bg-[var(--surface-muted)] rounded-xl p-2 flex flex-col gap-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ref.url} alt={ref.descricao ?? ref.tipo} className="w-full aspect-square object-cover rounded-lg" />
                  <span className="text-[11px] text-[var(--muted)]">
                    {TIPOS_REFERENCIA[ref.tipo as TipoReferencia]?.label ?? ref.tipo}
                  </span>
                  <form action={removerReferencia}>
                    <input type="hidden" name="id" value={ref.id} />
                    <input type="hidden" name="cliente_id" value={id} />
                    <button type="submit" className="text-[11px] text-[var(--muted)] underline">
                      remover
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <UploadMaterial clienteId={id} />
        </section>

        {/* ---------------- Pacotes e pagamentos (só gestão) ---------------- */}
        {gestao && (
        <section className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold">Pacotes e pagamentos</h2>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-[var(--surface-muted)] rounded-xl p-3">
              <p className="text-xs text-[var(--muted)]">Disponível</p>
              <p className="text-xl font-bold">{saldo.disponivel}</p>
            </div>
            <div className="bg-[var(--surface-muted)] rounded-xl p-3">
              <p className="text-xs text-[var(--muted)]">Usado</p>
              <p className="text-xl font-bold">{saldo.usado}</p>
            </div>
            <div className="bg-[var(--surface-muted)] rounded-xl p-3">
              <p className="text-xs text-[var(--muted)]">Comprado</p>
              <p className="text-xl font-bold">{saldo.total}</p>
            </div>
          </div>

          {pagamentos.length > 0 && (
            <ul className="flex flex-col gap-2">
              {pagamentos.map((pg) => (
                <li key={pg.id} className="flex items-center justify-between gap-3 bg-[var(--surface-muted)] rounded-xl px-3 py-2">
                  <span className="text-sm">
                    {centavosParaBRL(pg.valor_centavos)} · {pg.metodo}
                  </span>
                  {pg.status === "confirmado" ? (
                    <span className="badge">pago</span>
                  ) : (
                    <form action={confirmarPagamento}>
                      <input type="hidden" name="id" value={pg.id} />
                      <input type="hidden" name="cliente_id" value={id} />
                      <button type="submit" className="btn btn-outline text-xs py-1">
                        Marcar como pago
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form action={venderPacote} className="flex flex-col sm:flex-row gap-2 items-end">
            <input type="hidden" name="cliente_id" value={id} />
            <label className="flex flex-col gap-1">
              <span className="label">Imagens</span>
              <input name="qtd_imagens" type="number" min={1} defaultValue={10} className="input w-24" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Valor (R$)</span>
              <input name="valor_reais" defaultValue="34,90" className="input w-28" />
            </label>
            <label className="flex items-center gap-2 pb-2">
              <input type="checkbox" name="ja_pago" defaultChecked />
              <span className="text-sm">Já pago</span>
            </label>
            <button type="submit" className="btn btn-primary">
              Vender pacote
            </button>
          </form>
        </section>
        )}

        {/* ---------------- Dados cadastrais ---------------- */}
        <form action={atualizarCliente} className="card p-4 flex flex-col gap-3">
          <input type="hidden" name="id" value={id} />
          <h2 className="font-semibold">Dados do cliente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="label">Nome</span>
              <input name="nome" defaultValue={cliente.nome} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Nicho</span>
              <input name="nicho" defaultValue={cliente.nicho ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Contato</span>
              <input name="contato_nome" defaultValue={cliente.contato_nome ?? ""} className="input" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Telefone</span>
              <input name="contato_telefone" defaultValue={cliente.contato_telefone ?? ""} className="input" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="label">Observações</span>
            <textarea name="observacoes" defaultValue={cliente.observacoes ?? ""} className="input min-h-[70px] resize-none" />
          </label>
          <button type="submit" className="btn btn-outline self-start">
            Salvar dados
          </button>
        </form>
      </main>
    </>
  );
}
