import { createClient } from "@/lib/supabase/server";
import type { TipoGeracao } from "./types";

// Instrumentação de custo. O modelo antigo contava "créditos" do lojista, que
// é uma unidade comercial — não dizia nada sobre quanto a operação custou de
// verdade. Aqui registramos o custo real de CADA chamada de API, inclusive as
// que falharam (falha também é dinheiro gasto).

// ---------------------------------------------------------------------------
// TABELA DE PREÇOS — CONFERIR ANTES DE CONFIAR NOS NÚMEROS
// ---------------------------------------------------------------------------
// Estes valores são um ponto de partida, NÃO uma fonte de verdade: preço de
// API muda e varia por conta/região. Confira no painel de billing da OpenAI e
// ajuste aqui — é o único lugar do app que precisa mudar.
//
// Por isso usage_raw é gravado junto em `geracoes`: com o dado bruto guardado,
// corrigir a tabela depois permite RECALCULAR o histórico inteiro, em vez de
// perder o custo real das gerações antigas.
//
// Valores em USD.
export const PRECO_IMAGEM_USD: Record<string, Record<string, number>> = {
  "gpt-image-2": {
    low: 0.02,
    medium: 0.07,
    high: 0.19,
  },
};

// Texto: USD por 1M de tokens (entrada/saída).
export const PRECO_TEXTO_USD: Record<string, { entrada: number; saida: number }> = {
  "gpt-5.4": { entrada: 2.5, saida: 10 },
  "gpt-5.4-nano": { entrada: 0.1, saida: 0.4 },
  "gpt-5.5": { entrada: 5, saida: 20 },
};

// Transcrição: USD por minuto de áudio.
export const PRECO_TRANSCRICAO_USD_POR_MINUTO = 0.006;

// Câmbio. Configurável por env para não precisar de deploy a cada variação
// relevante do dólar; o valor usado fica gravado em cada linha de `geracoes`,
// então relatório antigo nunca é reescrito por câmbio novo.
export function cambioAtual(): number {
  const bruto = Number(process.env.USD_BRL);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : 5.5;
}

export function custoImagemUSD(modelo: string, qualidade: string): number {
  return PRECO_IMAGEM_USD[modelo]?.[qualidade] ?? 0;
}

export function custoTextoUSD(modelo: string, tokensEntrada: number, tokensSaida: number): number {
  const preco = PRECO_TEXTO_USD[modelo];
  if (!preco) return 0;
  return (tokensEntrada / 1_000_000) * preco.entrada + (tokensSaida / 1_000_000) * preco.saida;
}

export interface RegistroGeracao {
  tipo: TipoGeracao;
  modelo: string;
  qualidade?: string | null;
  tamanho?: string | null;
  custoUsd: number;
  usageRaw?: Record<string, unknown> | null;
  duracaoMs?: number;
  sucesso?: boolean;
  erro?: string | null;
  pecaId?: string | null;
  pedidoId?: string | null;
  clienteId?: string | null;
}

// Grava uma geração. NUNCA lança: medir custo não pode derrubar a entrega da
// imagem. Se o registro falhar, perdemos uma linha de relatório — se ele
// derrubasse a request, perderíamos a peça e o crédito do cliente junto.
export async function registrarGeracao(registro: RegistroGeracao): Promise<void> {
  try {
    const supabase = await createClient();
    const cambio = cambioAtual();
    await supabase.from("geracoes").insert({
      peca_id: registro.pecaId ?? null,
      pedido_id: registro.pedidoId ?? null,
      cliente_id: registro.clienteId ?? null,
      tipo: registro.tipo,
      modelo: registro.modelo,
      qualidade: registro.qualidade ?? null,
      tamanho: registro.tamanho ?? null,
      usage_raw: registro.usageRaw ?? null,
      custo_usd: registro.custoUsd,
      cambio_brl: cambio,
      custo_brl: registro.custoUsd * cambio,
      duracao_ms: registro.duracaoMs ?? null,
      sucesso: registro.sucesso !== false,
      erro: registro.erro ?? null,
    });
  } catch (e) {
    console.error("[custo] falha ao registrar geração (seguindo mesmo assim):", e);
  }
}

// Mede uma chamada de API e registra o custo, com ou sem sucesso. Centraliza
// o try/finally para que nenhum caminho de erro escape da contabilidade.
export async function medirERegistrar<T>(
  base: Omit<RegistroGeracao, "custoUsd" | "duracaoMs" | "sucesso" | "erro">,
  custoUsd: number,
  executar: () => Promise<T>,
): Promise<T> {
  const inicio = Date.now();
  try {
    const resultado = await executar();
    await registrarGeracao({ ...base, custoUsd, duracaoMs: Date.now() - inicio, sucesso: true });
    return resultado;
  } catch (e) {
    await registrarGeracao({
      ...base,
      custoUsd,
      duracaoMs: Date.now() - inicio,
      sucesso: false,
      erro: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
