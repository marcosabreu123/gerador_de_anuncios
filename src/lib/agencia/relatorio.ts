import { createClient } from "@/lib/supabase/server";
import { hojeSP } from "@/lib/datas";
import { diasDesde, situacaoDoCliente, ultimosPedidos, type SituacaoCliente } from "./situacao-cliente";
import type { ResumoCustoCliente } from "./types";

// Agregações para o painel dos sócios. O rateio só é possível porque
// `geracoes` registra cliente_id em cada chamada de API — no modelo antigo
// não havia nada disso, e o custo por cliente era literalmente desconhecido.
//
// A conta do mês gira em torno da arte aprovada: é ela que gasta o crédito do
// cliente. Todo o gasto de API até a aprovação (variações que ninguém escolheu,
// ajustes, outros formatos e falhas) é dividido pelas artes aprovadas.

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

export interface ClienteNaCarteira {
  id: string;
  nome: string;
  situacao: SituacaoCliente;
  // Dias desde o último pedido. Nulo para quem nunca pediu.
  dias_sem_pedido: number | null;
}

export interface RelatorioDoMes {
  resumos: ResumoCustoCliente[];
  producao: ProducaoDoDia[];
  carteira: ClienteNaCarteira[];
}

export async function relatorioDoMes(periodo: PeriodoRelatorio): Promise<RelatorioDoMes> {
  const supabase = await createClient();

  const [
    { data: clientes },
    { data: geracoes },
    { data: feitas },
    { data: aprovadas },
    { data: pagamentos },
    ultimos,
  ] = await Promise.all([
    supabase.from("clientes").select("id, nome, ativo, em_teste, created_at"),
    supabase
      .from("geracoes")
      .select("cliente_id, custo_brl, tipo")
      .gte("created_at", periodo.inicio)
      .lte("created_at", periodo.fim),
    // Feitas no mês: dão o tempo humano e o que ainda está sem aprovação.
    supabase
      .from("pecas")
      .select("cliente_id, status, tempo_operacao_segundos")
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
    ultimosPedidos(supabase),
  ]);

  const hoje = hojeSP();
  const porCliente = new Map<string, ResumoCustoCliente>();
  const carteira: ClienteNaCarteira[] = [];
  for (const c of clientes ?? []) {
    porCliente.set(c.id, {
      cliente_id: c.id,
      cliente_nome: c.nome,
      em_teste: Boolean(c.em_teste),
      artes_aprovadas: 0,
      aguardando_aprovacao: 0,
      geracoes: 0,
      geracoes_por_arte: 0,
      custo_brl: 0,
      receita_brl: 0,
      margem_brl: 0,
      tempo_operacao_segundos: 0,
    });
    const ultimo = ultimos.get(c.id) ?? null;
    carteira.push({
      id: c.id,
      nome: c.nome,
      situacao: situacaoDoCliente(c, ultimo, hoje),
      dias_sem_pedido: diasDesde(ultimo, hoje),
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
    if (!alvo) continue;
    if (p.status === "gerada") alvo.aguardando_aprovacao += 1;
    alvo.tempo_operacao_segundos += p.tempo_operacao_segundos ?? 0;
  }

  // O gráfico mostra a produção da agência: cliente em teste fica de fora dele também.
  const aprovadasNoDia: string[] = [];
  for (const p of aprovadas ?? []) {
    const alvo = porCliente.get(p.cliente_id);
    if (!alvo || !p.aprovada_em) continue;
    alvo.artes_aprovadas += 1;
    if (!alvo.em_teste) aprovadasNoDia.push(p.aprovada_em);
  }

  for (const pg of pagamentos ?? []) {
    const alvo = porCliente.get(pg.cliente_id);
    if (!alvo) continue;
    alvo.receita_brl += pg.valor_centavos / 100;
  }

  for (const resumo of porCliente.values()) {
    // O multiplicador que decide a margem: quantas IMAGENS foram precisas por
    // arte aprovada. 1 = acertou de primeira; 3+ = o briefing ou o brand kit
    // do cliente precisa de ajuste, porque cada tentativa extra sai da margem.
    resumo.geracoes_por_arte = resumo.artes_aprovadas > 0 ? resumo.geracoes / resumo.artes_aprovadas : 0;
    resumo.margem_brl = resumo.receita_brl - resumo.custo_brl;
  }

  return {
    resumos: [...porCliente.values()].sort((a, b) => b.custo_brl - a.custo_brl),
    producao: artesPorDia(aprovadasNoDia, periodo),
    carteira,
  };
}

export interface TotaisPeriodo {
  receita_brl: number;
  custo_brl: number;
  margem_brl: number;
  artes_aprovadas: number;
  aguardando_aprovacao: number;
  geracoes: number;
  // Todo o gasto de API do mês dividido pelas artes aprovadas no mês.
  custo_por_arte_aprovada: number;
  tempo_por_arte_min: number;
  // Clientes em teste ficam fora de tudo acima. O custo deles é da agência e
  // aparece à parte, para não sumir.
  custo_em_teste_brl: number;
}

export function totalizar(resumos: ResumoCustoCliente[]): TotaisPeriodo {
  const t = { receita: 0, custo: 0, aprovadas: 0, aguardando: 0, geracoes: 0, tempo: 0, custoTeste: 0 };
  for (const r of resumos) {
    if (r.em_teste) {
      t.custoTeste += r.custo_brl;
      continue;
    }
    t.receita += r.receita_brl;
    t.custo += r.custo_brl;
    t.aprovadas += r.artes_aprovadas;
    t.aguardando += r.aguardando_aprovacao;
    t.geracoes += r.geracoes;
    t.tempo += r.tempo_operacao_segundos;
  }

  return {
    receita_brl: t.receita,
    custo_brl: t.custo,
    margem_brl: t.receita - t.custo,
    artes_aprovadas: t.aprovadas,
    aguardando_aprovacao: t.aguardando,
    geracoes: t.geracoes,
    custo_por_arte_aprovada: t.aprovadas > 0 ? t.custo / t.aprovadas : 0,
    // Tempo humano é o que realmente aperta a margem de um pacote de
    // R$ 34,90 por 10 créditos — por isso entra no painel ao lado do custo.
    tempo_por_arte_min: t.aprovadas > 0 ? t.tempo / t.aprovadas / 60 : 0,
    custo_em_teste_brl: t.custoTeste,
  };
}

export function contarCarteira(carteira: ClienteNaCarteira[]): Record<SituacaoCliente, number> {
  const contagem: Record<SituacaoCliente, number> = { ativo: 0, inativo: 0, em_teste: 0, arquivado: 0 };
  for (const c of carteira) contagem[c.situacao] += 1;
  return contagem;
}
