import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, ImagePlus, Plus, X } from "lucide-react";
import { ehSocio, requireOperador } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import Abas, { type Aba } from "@/components/Abas";
import BotaoEnviar from "@/components/BotaoEnviar";
import UploadMaterial from "@/components/UploadMaterial";
import { Avatar, CabecalhoPagina, EstadoVazio, SeloStatus, TituloCard } from "@/components/ui";
import { saldoDoCliente } from "@/lib/agencia/pacotes";
import {
  alternarArquivoCliente,
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
  const logo = referencias.find((r) => r.tipo === "logo")?.url;
  const leitura = brandKit?.direcao_arte ?? null;

  // Cliente arquivado não recebe pedido novo: reative antes, para não produzir
  // no lugar errado por engano.
  const novoPedido = cliente.ativo && (
    <Link href={`/clientes/${id}/nova-geracao`} className="btn btn-primary">
      <Plus size={16} aria-hidden="true" />
      Novo pedido
    </Link>
  );

  const visaoGeral = (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
      {/* ---------------- Galeria ---------------- */}
      <section className="card p-5 flex flex-col gap-4">
        <TituloCard
          titulo="Artes deste cliente"
          acoes={artes.length > 0 && <span className="text-xs text-[var(--muted)]">{artes.length} mais recentes</span>}
        />
        {artes.length === 0 ? (
          <EstadoVazio
            icone={ImagePlus}
            titulo="Nenhuma arte ainda"
            descricao="As artes entregues para este cliente ficam guardadas aqui."
            acao={novoPedido}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
            {artes.map((arte) => (
              <Link
                key={arte.id}
                href={`/pedidos/${arte.pedido_id}`}
                className="relative block rounded-[10px] overflow-hidden bg-[var(--surface-muted)] group"
                title={arte.titulo ?? "Arte"}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={arte.imagem_url!}
                  alt={arte.titulo ?? "Arte"}
                  loading="lazy"
                  className="w-full aspect-[4/5] object-cover transition-transform duration-200 group-hover:scale-[1.03]"
                />
                {/* Um selo de texto aqui cobriria o título da própria arte. */}
                {arte.status === "aprovada" && (
                  <span
                    title="Aprovada"
                    className="absolute top-1.5 right-1.5 flex items-center justify-center w-6 h-6 rounded-full bg-black/60 text-white"
                  >
                    <Check size={14} strokeWidth={3} aria-hidden="true" />
                    <span className="sr-only">Aprovada</span>
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---------------- Pedidos ---------------- */}
      <section className="card p-5 flex flex-col gap-3">
        <TituloCard titulo="Pedidos recentes" />
        {pedidos.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nenhum pedido ainda.</p>
        ) : (
          <ul className="flex flex-col -mx-2">
            {pedidos.map((pedido) => (
              <li key={pedido.id}>
                <Link
                  href={`/pedidos/${pedido.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-[var(--surface-muted)] transition-colors"
                >
                  <span className="text-sm truncate">{pedido.titulo ?? "Pedido"}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <SeloStatus status={pedido.status} />
                    <ChevronRight size={14} className="text-[var(--muted)]" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const identidade = (
    <form action={salvarBrandKit} className="flex flex-col gap-4">
      <input type="hidden" name="cliente_id" value={id} />
      <p className="text-sm text-[var(--muted)]">
        Cores e regras a IA cumpre à risca. Tipografia, tom e estilo são um norte: escreva pouco, ou deixe em branco
        que ela tira isso das referências.
      </p>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <section className="card p-5 flex flex-col gap-3">
          <TituloCard titulo="Marca" />
          <Campo rotulo="Cores primárias">
            <input name="cores_primarias" defaultValue={brandKit?.cores_primarias ?? ""} className="input" placeholder="Ex: vermelho #D32F2F e amarelo #FBC02D" />
          </Campo>
          <Campo rotulo="Cores secundárias">
            <input name="cores_secundarias" defaultValue={brandKit?.cores_secundarias ?? ""} className="input" />
          </Campo>
          <Campo rotulo="Tipografia">
            <input name="tipografia" defaultValue={brandKit?.tipografia ?? ""} className="input" placeholder="Ex: letra pesada e comercial" />
          </Campo>
          <Campo rotulo="Tom de voz">
            <input name="tom_de_voz" defaultValue={brandKit?.tom_de_voz ?? ""} className="input" placeholder="Ex: descontraído e direto" />
          </Campo>
        </section>

        <section className="card p-5 flex flex-col gap-3">
          <TituloCard titulo="Direção das artes" />
          <Campo rotulo="Estilo visual">
            <textarea name="estilo_visual" defaultValue={brandKit?.estilo_visual ?? ""} className="input min-h-[76px] resize-y" placeholder="Em poucas palavras: vibrante, minimalista, sofisticado..." />
          </Campo>
          <Campo rotulo="Regras obrigatórias (uma por linha)">
            <textarea
              name="regras_obrigatorias"
              defaultValue={(brandKit?.regras_obrigatorias ?? []).join("\n")}
              className="input min-h-[76px] resize-y"
              placeholder={"sempre mostrar o WhatsApp\nsempre usar a logo"}
            />
          </Campo>
          <Campo rotulo="Regras proibidas (uma por linha)">
            <textarea
              name="regras_proibidas"
              defaultValue={(brandKit?.regras_proibidas ?? []).join("\n")}
              className="input min-h-[76px] resize-y"
              placeholder={"nunca usar fundo roxo\nnunca mostrar concorrente"}
            />
          </Campo>
        </section>

        <section className="card p-5 flex flex-col gap-3">
          <TituloCard titulo="Contato nas artes" />
          <Campo rotulo="WhatsApp">
            <input name="whatsapp" defaultValue={brandKit?.whatsapp ?? ""} className="input" />
          </Campo>
          <Campo rotulo="Endereço">
            <input name="endereco" defaultValue={brandKit?.endereco ?? ""} className="input" />
          </Campo>
          <Campo rotulo="Horário">
            <input name="horario_funcionamento" defaultValue={brandKit?.horario_funcionamento ?? ""} className="input" />
          </Campo>
          <Campo rotulo="Instagram">
            <input name="instagram" defaultValue={brandKit?.instagram ?? ""} className="input" />
          </Campo>
        </section>
      </div>

      <BotaoEnviar className="btn btn-primary self-start">Salvar identidade</BotaoEnviar>
    </form>
  );

  const materiais = (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
      <section className="card p-5 flex flex-col gap-4">
        <TituloCard
          titulo="Materiais do cliente"
          descricao="Logo e fotos entram na geração. Artes aprovadas viram padrão e reduzem retrabalho nos próximos pedidos."
        />

        {referencias.length === 0 ? (
          <EstadoVazio
            icone={ImagePlus}
            titulo="Nenhum material ainda"
            descricao="Envie a logo e as fotos dos produtos para as artes saírem com a cara da empresa."
          />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {referencias.map((ref) => (
              <li key={ref.id} className="relative group flex flex-col gap-1.5 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ref.url}
                  alt={ref.descricao ?? ref.tipo}
                  loading="lazy"
                  className="w-full aspect-square object-contain rounded-[10px] bg-[var(--surface-muted)]"
                />
                <span className="text-xs text-[var(--muted)] truncate">
                  {TIPOS_REFERENCIA[ref.tipo as TipoReferencia]?.label ?? ref.tipo}
                </span>
                <form action={removerReferencia} className="absolute top-1.5 right-1.5">
                  <input type="hidden" name="id" value={ref.id} />
                  <input type="hidden" name="cliente_id" value={id} />
                  <button
                    type="submit"
                    title="Remover"
                    className="flex items-center justify-center w-7 h-7 rounded-lg bg-black/60 text-white lg:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  >
                    <X size={14} aria-hidden="true" />
                    <span className="sr-only">Remover</span>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-col gap-4">
        <section className="card p-5 flex flex-col gap-3">
          <TituloCard titulo="Enviar material" />
          <UploadMaterial clienteId={id} />
        </section>

        {leitura && (
          <section className="card p-5 flex flex-col gap-3">
            <TituloCard
              titulo="O que a IA entendeu das referências"
              descricao="Ela lê as imagens sozinha, e relê quando você abre um novo pedido depois de trocar alguma."
            />
            <dl className="flex flex-col gap-2.5">
              <Entendimento rotulo="O negócio" texto={leitura.negocio} />
              <Entendimento rotulo="O que a marca costuma dizer" texto={leitura.mensagens} />
              <Entendimento rotulo="Como a marca fala" texto={leitura.voz} />
              <Entendimento rotulo="Como a marca aparece" texto={leitura.visual} />
            </dl>
          </section>
        )}
      </div>
    </div>
  );

  const financeiro = (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
      <section className="card p-5 flex flex-col gap-4">
        <TituloCard titulo="Saldo do pacote" />
        <div className="grid grid-cols-3 gap-3">
          <Numero rotulo="Disponível" valor={saldo.disponivel} />
          <Numero rotulo="Usado" valor={saldo.usado} />
          <Numero rotulo="Comprado" valor={saldo.total} />
        </div>

        <form action={venderPacote} className="flex flex-wrap gap-3 items-end border-t border-[var(--border)] pt-4">
          <input type="hidden" name="cliente_id" value={id} />
          <label className="flex flex-col">
            <span className="label">Imagens</span>
            <input name="qtd_imagens" type="number" min={1} defaultValue={10} className="input w-24" />
          </label>
          <label className="flex flex-col">
            <span className="label">Valor (R$)</span>
            <input name="valor_reais" defaultValue="34,90" className="input w-28" />
          </label>
          <label className="flex items-center gap-2 min-h-10">
            <input type="checkbox" name="ja_pago" defaultChecked />
            <span className="text-sm">Já pago</span>
          </label>
          <BotaoEnviar>Vender pacote</BotaoEnviar>
        </form>
      </section>

      <section className="card p-5 flex flex-col gap-3">
        <TituloCard titulo="Pagamentos" />
        {pagamentos.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Nenhum pagamento registrado.</p>
        ) : (
          <ul className="flex flex-col">
            {pagamentos.map((pg) => (
              <li
                key={pg.id}
                className="flex items-center justify-between gap-3 py-2.5 border-t first:border-t-0 border-[var(--border)]"
              >
                <span className="text-sm tabular-nums">
                  {centavosParaBRL(pg.valor_centavos)}
                  <span className="text-[var(--muted)]"> · {pg.metodo}</span>
                </span>
                {pg.status === "confirmado" ? (
                  <span className="badge badge-success">Pago</span>
                ) : (
                  <form action={confirmarPagamento}>
                    <input type="hidden" name="id" value={pg.id} />
                    <input type="hidden" name="cliente_id" value={id} />
                    <BotaoEnviar className="btn btn-outline btn-sm">Marcar como pago</BotaoEnviar>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );

  const dados = (
    <div className={`grid grid-cols-1 gap-4 items-start ${gestao ? "xl:grid-cols-[minmax(0,1fr)_380px]" : ""}`}>
      <form action={atualizarCliente} className="card p-5 flex flex-col gap-4">
        <input type="hidden" name="id" value={id} />
        <TituloCard titulo="Dados do cliente" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo rotulo="Nome">
            <input name="nome" defaultValue={cliente.nome} className="input" />
          </Campo>
          <Campo rotulo="Nicho">
            <input name="nicho" defaultValue={cliente.nicho ?? ""} className="input" />
          </Campo>
          <Campo rotulo="Contato">
            <input name="contato_nome" defaultValue={cliente.contato_nome ?? ""} className="input" />
          </Campo>
          <Campo rotulo="Telefone">
            <input name="contato_telefone" defaultValue={cliente.contato_telefone ?? ""} className="input" />
          </Campo>
        </div>
        <Campo rotulo="Sobre a empresa">
          <textarea
            name="observacoes"
            defaultValue={cliente.observacoes ?? ""}
            className="input min-h-[76px] resize-y"
            placeholder="O que ela faz, para quem e como a pessoa compra. A IA lê isto antes de criar qualquer arte."
          />
        </Campo>
        <BotaoEnviar className="btn btn-outline self-start">Salvar dados</BotaoEnviar>
      </form>

      {/* Arquivar é decisão comercial (o cliente saiu), então fica com o
          sócio. Não apaga nada: o histórico continua valendo no relatório. */}
      {gestao && (
        <form action={alternarArquivoCliente} className="card p-5 flex flex-col items-start gap-3">
          <input type="hidden" name="id" value={id} />
          <TituloCard
            titulo={cliente.ativo ? "Arquivar cliente" : "Reativar cliente"}
            descricao={
              cliente.ativo
                ? "Some da lista de clientes ativos. Pedidos, peças e pacotes continuam guardados."
                : "Este cliente está arquivado. Reativar devolve ele à lista de ativos."
            }
          />
          <BotaoEnviar className="btn btn-outline">{cliente.ativo ? "Arquivar" : "Reativar"}</BotaoEnviar>
        </form>
      )}
    </div>
  );

  const abas: Aba[] = [
    { id: "geral", rotulo: "Visão geral", conteudo: visaoGeral },
    { id: "identidade", rotulo: "Identidade visual", conteudo: identidade },
    { id: "materiais", rotulo: "Materiais", conteudo: materiais },
    ...(gestao ? [{ id: "pacotes", rotulo: "Pacotes e pagamentos", conteudo: financeiro }] : []),
    { id: "dados", rotulo: "Dados", conteudo: dados },
  ];

  return (
    <main className="pagina flex flex-col gap-6">
      <CabecalhoPagina
        voltar={{ href: "/clientes", rotulo: "Clientes" }}
        inicio={<Avatar nome={cliente.nome} src={logo} tamanho={52} />}
        titulo={cliente.nome}
        descricao={cliente.nicho ?? "Nicho não informado"}
        acoes={
          <>
            {!cliente.ativo && <span className="badge badge-warning">Arquivado</span>}
            <span className={`badge ${saldo.disponivel === 0 ? "badge-danger" : ""}`} title="Imagens disponíveis no pacote">
              {saldo.disponivel} {saldo.disponivel === 1 ? "imagem" : "imagens"}
            </span>
            {novoPedido}
          </>
        }
      />

      {saldo.disponivel === 0 && cliente.ativo && (
        <div className="card p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-[var(--danger)] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium text-sm">Cliente sem saldo</p>
            <p className="text-[13px] text-[var(--muted)] mt-0.5">
              {gestao
                ? "Venda um pacote antes de produzir, ou gere mesmo assim se o pagamento já foi combinado."
                : "Avise um sócio para lançar o pacote. Sem saldo, a geração fica bloqueada."}
            </p>
          </div>
        </div>
      )}

      <Abas abas={abas} />
    </main>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col">
      <span className="label">{rotulo}</span>
      {children}
    </label>
  );
}

function Entendimento({ rotulo, texto }: { rotulo: string; texto: string }) {
  if (!texto) return null;
  return (
    <div>
      <dt className="text-[13px] font-medium">{rotulo}</dt>
      <dd className="text-[13px] text-[var(--muted)] mt-0.5">{texto}</dd>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="quadro p-3.5">
      <p className="text-[13px] text-[var(--muted)]">{rotulo}</p>
      <p className="text-2xl font-semibold tracking-tight mt-0.5">{valor}</p>
    </div>
  );
}
