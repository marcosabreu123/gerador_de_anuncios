import { ehSocio, requireOperador } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import ListaProducao, { type ClienteCard, type SeloCard } from "@/components/ListaProducao";
import { mesAtual } from "@/lib/agencia/relatorio";
import {
  JANELA_PADRAO,
  imagensDisponiveis,
  montarLinhas,
  prazoDoPlano,
  situacaoDoPlano,
} from "@/lib/agencia/cobrancas";
import { diasDesde, filtroDaProducao, situacaoDoCliente, ultimosPedidos } from "@/lib/agencia/situacao-cliente";
import { hojeSP } from "@/lib/datas";
import type { Cliente, Pacote, Pagamento } from "@/lib/agencia/types";

// Onde as artes são feitas: os clientes, o que está em produção e o que espera
// aprovação. Acessível a sócio E colaborador. O que muda por papel é o que
// aparece dentro do cliente (plano e pagamentos só para sócio).
export default async function ProducaoPage({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { perfil } = await requireOperador();
  const socio = ehSocio(perfil);
  const supabase = await createClient();
  const periodo = mesAtual();
  const filtro = filtroDaProducao((await searchParams).filtro);

  // Tudo em consultas agregadas em vez de uma por card — com 100 clientes,
  // uma consulta por card deixaria a página inutilizável.
  const [
    { data: clientesRaw },
    { data: pacotesRaw },
    { data: aprovadas },
    { data: prontas },
    { data: pedidosAtivos },
    { data: logos },
    { data: abertos },
    ultimos,
  ] = await Promise.all([
    supabase.from("clientes").select("*").order("ativo", { ascending: false }).order("nome"),
    supabase.from("pacotes").select("*"),
    supabase
      .from("pecas")
      .select("cliente_id")
      .eq("status", "aprovada")
      .gte("aprovada_em", periodo.inicio)
      .lte("aprovada_em", periodo.fim),
    // Prontas esperando aprovação, de qualquer mês: é trabalho parado.
    supabase.from("pecas").select("cliente_id").eq("status", "gerada"),
    supabase.from("pedidos").select("cliente_id").in("status", ["processando", "planejado"]),
    supabase.from("referencias").select("cliente_id, url").eq("tipo", "logo"),
    // Cobrança é do sócio: o colaborador nem consulta os pagamentos.
    socio ? supabase.from("pagamentos").select("*").eq("status", "pendente") : { data: [] },
    ultimosPedidos(supabase),
  ]);

  // Mesmo dia da tela do cliente e da cobrança (ver lib/datas.ts).
  const hoje = hojeSP();
  const clientes = (clientesRaw ?? []) as Cliente[];
  const pacotes = (pacotesRaw ?? []) as Pacote[];

  const pacotesPorCliente = new Map<string, Pacote[]>();
  for (const p of pacotes) {
    const lista = pacotesPorCliente.get(p.cliente_id);
    if (lista) lista.push(p);
    else pacotesPorCliente.set(p.cliente_id, [p]);
  }

  const contar = (linhas: { cliente_id: string }[] | null) => {
    const n = new Map<string, number>();
    for (const l of linhas ?? []) n.set(l.cliente_id, (n.get(l.cliente_id) ?? 0) + 1);
    return n;
  };
  const aprovadasPorCliente = contar(aprovadas);
  const prontasPorCliente = contar(prontas);
  const emAndamento = new Set((pedidosAtivos ?? []).map((p) => p.cliente_id));
  const logoPorCliente = new Map((logos ?? []).map((l) => [l.cliente_id, l.url as string]));

  // A mesma conta da aba Clientes, para o card não discordar dela. Cliente em
  // teste ou arquivado não é cobrado.
  const selosDeCobranca = new Map<string, SeloCard[]>();
  if (socio) {
    const linhas = montarLinhas({
      clientes: clientes.filter((c) => c.ativo && !c.em_teste),
      pacotes: pacotes.filter((p) => p.tipo === "tempo" && p.status !== "cancelado"),
      pagamentos: (abertos ?? []) as Pagamento[],
      logos: new Map(),
      hoje,
    });
    for (const l of linhas) {
      const selos: SeloCard[] = [];
      const plano = situacaoDoPlano(l.dias, JANELA_PADRAO);
      if (plano === "sem_plano") selos.push({ rotulo: "Sem plano", tom: "badge-warning" });
      if (plano === "vencido") selos.push({ rotulo: "Plano vencido", tom: "badge-danger" });
      if (plano === "vencendo" && l.dias !== null) selos.push({ rotulo: prazoDoPlano(l.dias), tom: "badge-warning" });
      if (l.pagamento === "pendente") selos.push({ rotulo: "Pagamento pendente", tom: "badge-warning" });
      if (selos.length > 0) selosDeCobranca.set(l.clienteId, selos);
    }
  }

  const cards: ClienteCard[] = clientes.map((c) => {
    const ultimo = ultimos.get(c.id) ?? null;
    return {
      id: c.id,
      nome: c.nome,
      nicho: c.nicho,
      logo: logoPorCliente.get(c.id) ?? null,
      situacao: situacaoDoCliente(c, ultimo, hoje),
      diasSemPedido: diasDesde(ultimo, hoje),
      saldo: imagensDisponiveis(pacotesPorCliente.get(c.id) ?? [], hoje),
      aprovadasNoMes: aprovadasPorCliente.get(c.id) ?? 0,
      paraAprovar: prontasPorCliente.get(c.id) ?? 0,
      temPedidoEmAndamento: emAndamento.has(c.id),
      cobranca: selosDeCobranca.get(c.id) ?? [],
    };
  });

  return (
    <main className="pagina flex flex-col gap-6">
      {/* A chave remonta a lista quando um link abre outro filtro pelo endereço. */}
      <ListaProducao key={filtro} clientes={cards} filtroInicial={filtro} podeCadastrar={socio} />
    </main>
  );
}
