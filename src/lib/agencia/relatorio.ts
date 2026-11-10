import { createClient } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/datas";
import { imagensDisponiveis } from "./cobrancas";
import { diasDesde, situacaoDoCliente, ultimosPedidos } from "./situacao-cliente";
import type { ResumoCustoCliente } from "./types";

// Agregações para o painel dos sócios. O rateio só é possível porque
// `geracoes` registra cliente_id em cada chamada de API — no modelo antigo
// não havia nada disso, e o custo por cliente era literalmente desconhecido.
//
// A conta do mês gira em torno da arte aprovada: é ela que gasta o crédito do
// cliente. Todo o custo de geração até a aprovação (variações que ninguém
// escolheu, ajustes, outros formatos e falhas) é dividido pelas artes aprovadas.
//
// O custo aqui é o que cada arte gastou para gerar. O dinheiro que saiu para a
// OpenAI, a recarga, fica no Financeiro. Os dois nunca se somam: a recarga já
// paga estas gerações.

export interface PeriodoRelatorio {
  inicio: string; // ISO
  fim: string; // ISO
}

// Mês corrente no relógio de São Paulo. O servidor roda em UTC: pelo mês dele,
// das 21h do último dia em diante o painel já mostrava o mês seguinte, vazio.
// São Paulo não tem horário de verão desde 2019, então o fuso é sempre -03:00.
export function mesAtual(agora: Date = new Date()): PeriodoRelatorio {
  const [ano, mes] = hojeSP(agora).split("-");
  const ultimoDia = new Date(Date.UTC(Number(ano), Number(mes), 0)).getUTCDate();
  return {
    inicio: new Date(`${ano}-${mes}-01T00:00:00-03:00`).toISOString(),
    fim: new Date(`${ano}-${mes}-${String(ultimoDia).padStart(2, "0")}T23:59:59.999-03:00`).toISOString(),
  };
}

// O dia é o de São Paulo: em UTC, o que sai depois das 21h cairia no dia seguinte.
const DIA_EM_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "numeric" });

export function diaDoMesAgora(): number {
  return Number(DIA_EM_SP.format(new Date()));
}

// Artes aprovadas em cada dia do período.
export interface ProducaoDoDia {
  dia: number;
  artes: number;
}

export function artesPorDia(instantes: string[], periodo: PeriodoRelatorio): ProducaoDoDia[] {
  const diasNoMes = Number(DIA_EM_SP.format(new Date(periodo.fim)));
  const dias = Array.from({ length: diasNoMes }, (_, i) => ({ dia: i + 1, artes: 0 }));
  for (const instante of instantes) {
    const alvo = dias[Number(DIA_EM_SP.format(new Date(instante))) - 1];
    if (alvo) alvo.artes += 1;
  }
  return dias;
}

export interface RelatorioDoMes {
  // Todos os clientes, inclusive quem não teve nada no mês e os arquivados.
  resumos: ResumoCustoCliente[];
  producao: ProducaoDoDia[];
}

export async function relatorioDoMes(periodo: PeriodoRelatorio): Promise<RelatorioDoMes> {
  const supabase = await createClient();

  const [
    { data: clientes },
    { data: geracoes },
    { data: feitas },
    { data: aprovadas },
    { data: pagamentos },
    { data: pedidos },
    { data: pacotes },
    ultimos,
  ] = await Promise.all([
    supabase.from("clientes").select("id, nome, ativo, em_teste, created_at"),
    supabase
      .from("geracoes")
      .select("cliente_id, custo_brl, tipo")
      .gte("created_at", periodo.inicio)
      .lte("created_at", periodo.fim),
    // Feitas no mês: dão o que ainda está sem aprovação.
    supabase
      .from("pecas")
      .select("cliente_id, status")
      .gte("created_at", periodo.inicio)
      .lte("created_at", periodo.fim),
    // Aprovadas no mês, mesmo que feitas antes: é a aprovação que gasta crédito.
    supabase
      .from("pecas")
      .select("cliente_id, aprovada_em")
      .eq("status", "aprovada")
      .gte("aprovada_em", periodo.inicio)
      .lte("aprovada_em", periodo.fim),
    // Receita entra no mês em que foi paga, não no mês em que foi lançada: um
    // plano lançado em aberto e pago no mês seguinte é receita do seguinte.
    supabase
      .from("pagamentos")
      .select("cliente_id, valor_centavos")
      .eq("status", "confirmado")
      .gte("pago_em", periodo.inicio)
      .lte("pago_em", periodo.fim),
    supabase.from("pedidos").select("cliente_id").gte("created_at", periodo.inicio).lte("created_at", periodo.fim),
    // Créditos de hoje: o saldo é agora, não do mês.
    supabase.from("pacotes").select("cliente_id, status, validade, qtd_imagens, qtd_usadas"),
    ultimosPedidos(supabase),
  ]);

  const hoje = hojeSP();
  const pacotesPor = new Map<string, NonNullable<typeof pacotes>>();
  for (const p of pacotes ?? []) {
    const lista = pacotesPor.get(p.cliente_id);
    if (lista) lista.push(p);
    else pacotesPor.set(p.cliente_id, [p]);
  }

  const porCliente = new Map<string, ResumoCustoCliente>();
  for (const c of clientes ?? []) {
    const ultimo = ultimos.get(c.id) ?? null;
    const emTeste = Boolean(c.em_teste);
    porCliente.set(c.id, {
      cliente_id: c.id,
      cliente_nome: c.nome,
      situacao: situacaoDoCliente(c, ultimo, hoje),
      em_teste: emTeste,
      dias_sem_pedido: diasDesde(ultimo, hoje),
      pedidos: 0,
      artes_aprovadas: 0,
      aguardando_aprovacao: 0,
      geracoes: 0,
      geracoes_por_arte: 0,
      custo_brl: 0,
      receita_brl: 0,
      margem_brl: 0,
      creditos: emTeste ? null : imagensDisponiveis(pacotesPor.get(c.id) ?? [], hoje),
    });
  }

  for (const g of geracoes ?? []) {
    const alvo = g.cliente_id ? porCliente.get(g.cliente_id) : null;
    if (!alvo) continue;
    // O custo soma TUDO (texto, imagem e transcrição), mas a contagem de
    // "gerações" conta só imagem: é a imagem que representa uma tentativa de
    // arte. Contando todas as chamadas, uma peça que acerta de primeira já
    // marcava 2,0 (um prompt + uma imagem) e parecia retrabalho.
    if (g.tipo === "imagem") alvo.geracoes += 1;
    alvo.custo_brl += Number(g.custo_brl ?? 0);
  }

  for (const p of feitas ?? []) {
    const alvo = porCliente.get(p.cliente_id);
    if (alvo && p.status === "gerada") alvo.aguardando_aprovacao += 1;
  }

  // O gráfico mostra tudo que a agência aprovou, inclusive para os clientes em teste.
  const aprovadasNoDia: string[] = [];
  for (const p of aprovadas ?? []) {
    const alvo = porCliente.get(p.cliente_id);
    if (!alvo || !p.aprovada_em) continue;
    alvo.artes_aprovadas += 1;
    aprovadasNoDia.push(p.aprovada_em);
  }

  for (const pg of pagamentos ?? []) {
    const alvo = porCliente.get(pg.cliente_id);
    if (alvo) alvo.receita_brl += pg.valor_centavos / 100;
  }

  for (const p of pedidos ?? []) {
    const alvo = porCliente.get(p.cliente_id);
    if (alvo) alvo.pedidos += 1;
  }

  for (const resumo of porCliente.values()) {
    // Cliente em teste não paga: o que ele pagou antes de entrar no teste sai da
    // receita, como nas cobranças.
    if (resumo.em_teste) resumo.receita_brl = 0;
    // O multiplicador que decide a margem: quantas IMAGENS foram precisas por
    // arte aprovada. 1 = acertou de primeira; 3+ = o briefing ou o brand kit
    // do cliente precisa de ajuste, porque cada tentativa extra sai da margem.
    resumo.geracoes_por_arte = resumo.artes_aprovadas > 0 ? resumo.geracoes / resumo.artes_aprovadas : 0;
    resumo.margem_brl = resumo.receita_brl - resumo.custo_brl;
  }

  return {
    resumos: [...porCliente.values()].sort((a, b) => b.custo_brl - a.custo_brl),
    producao: artesPorDia(aprovadasNoDia, periodo),
  };
}

export interface TotaisPeriodo {
  // Só os clientes pagantes: quem está em teste não paga.
  receita_brl: number;
  custo_pagantes_brl: number;
  margem_brl: number;
  // Todos os clientes. A parte dos clientes em teste vem separada.
  custo_brl: number;
  custo_em_teste_brl: number;
  artes_aprovadas: number;
  artes_em_teste: number;
  // Sem os arquivados: cliente que saiu não vai aprovar mais nada.
  aguardando_aprovacao: number;
  geracoes: number;
  pedidos: number;
  // Todo o custo de geração do mês dividido pelas artes aprovadas no mês.
  custo_por_arte_aprovada: number;
}

export function totalizar(resumos: ResumoCustoCliente[]): TotaisPeriodo {
  const t = {
    receita: 0,
    custoPagantes: 0,
    custo: 0,
    custoTeste: 0,
    aprovadas: 0,
    aprovadasTeste: 0,
    aguardando: 0,
    geracoes: 0,
    pedidos: 0,
  };
  for (const r of resumos) {
    t.custo += r.custo_brl;
    t.aprovadas += r.artes_aprovadas;
    t.geracoes += r.geracoes;
    t.pedidos += r.pedidos;
    if (r.situacao !== "arquivado") t.aguardando += r.aguardando_aprovacao;
    if (r.em_teste) {
      t.custoTeste += r.custo_brl;
      t.aprovadasTeste += r.artes_aprovadas;
    } else {
      t.receita += r.receita_brl;
      t.custoPagantes += r.custo_brl;
    }
  }

  return {
    receita_brl: t.receita,
    custo_pagantes_brl: t.custoPagantes,
    margem_brl: t.receita - t.custoPagantes,
    custo_brl: t.custo,
    custo_em_teste_brl: t.custoTeste,
    artes_aprovadas: t.aprovadas,
    artes_em_teste: t.aprovadasTeste,
    aguardando_aprovacao: t.aguardando,
    geracoes: t.geracoes,
    pedidos: t.pedidos,
    custo_por_arte_aprovada: t.aprovadas > 0 ? t.custo / t.aprovadas : 0,
  };
}
