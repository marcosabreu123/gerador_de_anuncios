import { createClient } from "@/lib/supabase/server";
import type { ResumoCustoCliente } from "./types";

// Agregações para o dashboard dos sócios. O rateio só é possível porque
// `geracoes` registra cliente_id em cada chamada de API — no modelo antigo
// não havia nada disso, e o custo por cliente era literalmente desconhecido.

export interface PeriodoRelatorio {
  inicio: string; // ISO
  fim: string; // ISO
}

export function mesAtual(): PeriodoRelatorio {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);
  return { inicio: inicio.toISOString(), fim: fim.toISOString() };
}

export async function resumoPorCliente(periodo: PeriodoRelatorio): Promise<ResumoCustoCliente[]> {
  const supabase = await createClient();

  const [{ data: clientes }, { data: geracoes }, { data: pecas }, { data: pagamentos }] =
    await Promise.all([
      supabase.from("clientes").select("id, nome"),
      supabase
        .from("geracoes")
        .select("cliente_id, custo_brl, tipo")
        .gte("created_at", periodo.inicio)
        .lte("created_at", periodo.fim),
      supabase
        .from("pecas")
        .select("cliente_id, status, tempo_operacao_segundos, pacote_consumido")
        .gte("created_at", periodo.inicio)
        .lte("created_at", periodo.fim),
      // Receita entra no mês em que foi paga, não no mês em que foi lançada: um
      // plano lançado em aberto e pago no mês seguinte é receita do seguinte.
      supabase
        .from("pagamentos")
        .select("cliente_id, valor_centavos, status")
        .eq("status", "confirmado")
        .gte("pago_em", periodo.inicio)
        .lte("pago_em", periodo.fim),
    ]);

  const porCliente = new Map<string, ResumoCustoCliente>();
  for (const c of clientes ?? []) {
    porCliente.set(c.id, {
      cliente_id: c.id,
      cliente_nome: c.nome,
      pecas_entregues: 0,
      geracoes: 0,
      geracoes_por_peca: 0,
      custo_brl: 0,
      receita_brl: 0,
      margem_brl: 0,
      tempo_operacao_segundos: 0,
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

  for (const p of pecas ?? []) {
    const alvo = porCliente.get(p.cliente_id);
    if (!alvo) continue;
    // Conta como entregue o que de fato virou imagem para o cliente.
    if (p.status === "gerada" || p.status === "aprovada") alvo.pecas_entregues += 1;
    alvo.tempo_operacao_segundos += p.tempo_operacao_segundos ?? 0;
  }

  for (const pg of pagamentos ?? []) {
    const alvo = porCliente.get(pg.cliente_id);
    if (!alvo) continue;
    alvo.receita_brl += pg.valor_centavos / 100;
  }

  for (const resumo of porCliente.values()) {
    // O multiplicador que decide a margem: quantas IMAGENS foram precisas por
    // peça entregue. 1 = acertou de primeira; 3+ = o briefing ou o brand kit
    // do cliente precisa de ajuste, porque cada tentativa extra sai da margem.
    resumo.geracoes_por_peca =
      resumo.pecas_entregues > 0 ? resumo.geracoes / resumo.pecas_entregues : 0;
    resumo.margem_brl = resumo.receita_brl - resumo.custo_brl;
  }

  return [...porCliente.values()].sort((a, b) => b.custo_brl - a.custo_brl);
}

// Peças entregues em cada dia do período. O dia é o de São Paulo: em UTC, o que
// sai depois das 21h cairia no dia seguinte.
export interface ProducaoDoDia {
  dia: number;
  pecas: number;
}

const DIA_EM_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", day: "numeric" });

export function diaDoMesAgora(): number {
  return Number(DIA_EM_SP.format(new Date()));
}

export async function producaoPorDia(periodo: PeriodoRelatorio): Promise<ProducaoDoDia[]> {
  const supabase = await createClient();
  const { data: pecas } = await supabase
    .from("pecas")
    .select("created_at")
    .in("status", ["gerada", "aprovada"])
    .gte("created_at", periodo.inicio)
    .lte("created_at", periodo.fim);

  // getDate, não getUTCDate: mesAtual monta o fim do mês no fuso do servidor.
  const diasNoMes = new Date(periodo.fim).getDate();
  const dias = Array.from({ length: diasNoMes }, (_, i) => ({ dia: i + 1, pecas: 0 }));
  for (const p of pecas ?? []) {
    const alvo = dias[Number(DIA_EM_SP.format(new Date(p.created_at))) - 1];
    if (alvo) alvo.pecas += 1;
  }
  return dias;
}

export interface TotaisPeriodo {
  receita_brl: number;
  custo_brl: number;
  margem_brl: number;
  pecas_entregues: number;
  geracoes: number;
  custo_medio_por_peca: number;
  tempo_medio_por_peca_min: number;
}

export function totalizar(resumos: ResumoCustoCliente[]): TotaisPeriodo {
  const t = resumos.reduce(
    (acc, r) => ({
      receita_brl: acc.receita_brl + r.receita_brl,
      custo_brl: acc.custo_brl + r.custo_brl,
      pecas_entregues: acc.pecas_entregues + r.pecas_entregues,
      geracoes: acc.geracoes + r.geracoes,
      tempo: acc.tempo + r.tempo_operacao_segundos,
    }),
    { receita_brl: 0, custo_brl: 0, pecas_entregues: 0, geracoes: 0, tempo: 0 },
  );

  return {
    receita_brl: t.receita_brl,
    custo_brl: t.custo_brl,
    margem_brl: t.receita_brl - t.custo_brl,
    pecas_entregues: t.pecas_entregues,
    geracoes: t.geracoes,
    custo_medio_por_peca: t.pecas_entregues > 0 ? t.custo_brl / t.pecas_entregues : 0,
    // Tempo humano é o que realmente aperta a margem de um pacote de
    // R$ 34,90 por 10 imagens — por isso entra no painel ao lado do custo.
    tempo_medio_por_peca_min: t.pecas_entregues > 0 ? t.tempo / t.pecas_entregues / 60 : 0,
  };
}
