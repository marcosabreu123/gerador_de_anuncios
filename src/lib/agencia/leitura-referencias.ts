import { APIError } from "openai";
import { lerReferencias, type LeituraDasReferencias } from "@/lib/ai/ler-referencias";
import { TEXT_PROMPT_BUILDER_MODEL } from "@/lib/ai/models";
import { createAdminClient } from "@/lib/supabase/admin";
import { custoTextoUSD, registrarGeracao } from "./custo";
import type { BrandKit, Cliente, Referencia } from "./types";

// Cada imagem soma custo e tempo à leitura, e a partir daqui o entendimento da
// marca quase não muda. Valem as mais recentes.
const MAX_REFERENCIAS_LIDAS = 12;

async function guardar(clienteId: string, leitura: LeituraDasReferencias | null): Promise<void> {
  // Client admin porque colaborador produz, mas não necessariamente edita o cadastro.
  const { error } = await createAdminClient()
    .from("brand_kits")
    .upsert({ cliente_id: clienteId, direcao_arte: leitura }, { onConflict: "cliente_id" });
  if (error) console.error("[leitura-referencias] falha ao guardar:", error);
}

// Devolve a leitura das referências do cliente, refazendo quando o conjunto mudou.
//
// Não lança: sem leitura, a sugestão e a arte saem do mesmo jeito, só conhecendo
// menos a marca. Se a releitura falhar, vale a anterior, que ainda descreve quase
// o mesmo conjunto, e a próxima chamada tenta de novo.
export async function leituraEmDia(
  cliente: Cliente,
  brandKit: BrandKit | null,
  // Mais recentes primeiro.
  referencias: Referencia[],
): Promise<LeituraDasReferencias | null> {
  const guardada = brandKit?.direcao_arte ?? null;
  const lista = referencias.filter((r) => r.tipo === "referencia_visual").slice(0, MAX_REFERENCIAS_LIDAS);

  // Quem tirou todas as referências não pode seguir preso ao que elas mostravam.
  if (lista.length === 0) {
    if (guardada) await guardar(cliente.id, null);
    return null;
  }

  const assinatura = lista
    .map((r) => r.id)
    .sort()
    .join(",");
  if (guardada?.assinatura === assinatura) return guardada;

  const empresa = [
    `Empresa: ${cliente.nome}`,
    cliente.nicho?.trim() && `Ramo: ${cliente.nicho.trim()}`,
    cliente.observacoes?.trim() && `Sobre a empresa: ${cliente.observacoes.trim()}`,
  ]
    .filter(Boolean)
    .join("\n");

  const inicio = Date.now();
  try {
    const { leitura, uso } = await lerReferencias(
      lista.map((r) => r.url),
      assinatura,
      empresa,
    );
    await guardar(cliente.id, leitura);
    await registrarGeracao({
      tipo: "texto",
      modelo: uso.modelo,
      custoUsd: custoTextoUSD(uso.modelo, uso.entrada, uso.saida),
      usageRaw: { entrada: uso.entrada, saida: uso.saida, estimado: false },
      duracaoMs: Date.now() - inicio,
      clienteId: cliente.id,
    });
    return leitura;
  } catch (e) {
    console.error("[leitura-referencias]", e);
    // Erro 4xx é a OpenAI recusando antes de processar, como crédito esgotado: nada foi
    // gasto, e cada abertura da tela tentaria de novo, enchendo o rateio de custo falso.
    if (e instanceof APIError && e.status !== undefined && e.status < 500) return guardada;

    // As outras falhas custam. Sem usage na resposta, estima pelo consumo medido.
    await registrarGeracao({
      tipo: "texto",
      modelo: TEXT_PROMPT_BUILDER_MODEL,
      custoUsd: custoTextoUSD(TEXT_PROMPT_BUILDER_MODEL, 6000, 400),
      usageRaw: { estimado: true },
      duracaoMs: Date.now() - inicio,
      sucesso: false,
      erro: e instanceof Error ? e.message : String(e),
      clienteId: cliente.id,
    });
    return guardada;
  }
}
