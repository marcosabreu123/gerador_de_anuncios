import { transcreverAudio } from "@/lib/ai/agente-pedido";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRECO_TRANSCRICAO_USD_POR_MINUTO, registrarGeracao } from "./custo";

// Transcreve o áudio do operador e lança o custo no rateio do cliente.
export async function transcreverPedido(audio: File, clienteId: string): Promise<string> {
  const inicio = Date.now();
  const { data: cliente } = await createAdminClient()
    .from("clientes")
    .select("nome")
    .eq("id", clienteId)
    .maybeSingle();
  const { texto, duracaoSegundos } = await transcreverAudio(audio, cliente?.nome);

  // Sem duração na resposta, estima pelo tamanho para o custo não ficar
  // zerado no rateio.
  const minutos = (duracaoSegundos ?? audio.size / 32_000) / 60;
  await registrarGeracao({
    tipo: "transcricao",
    modelo: "whisper-1",
    custoUsd: minutos * PRECO_TRANSCRICAO_USD_POR_MINUTO,
    duracaoMs: Date.now() - inicio,
    clienteId,
  });

  return texto;
}
