import type OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";

// Recusa do modelo (guardrail de conteúdo) é um modo de falha bem diferente
// de "a API caiu" ou "o conteúdo não é JSON válido" — não deve ser tratada
// como se fosse texto normal indo pro JSON.parse do chamador.
export class RecusaModeloError extends Error {
  constructor() {
    super("O modelo se recusou a responder a essa solicitação.");
    this.name = "RecusaModeloError";
  }
}

// Chamada de chat completion com 1 retry automático. Falha transiente de
// rede/API (timeout, 5xx) não deve virar erro cru pro usuário já na primeira
// tentativa — só depois da segunda falha o chamador cai no fallback dele.
// Não faz parse do conteúdo aqui: cada chamador extrai/interpreta o texto
// (JSON ou texto livre) do jeito que precisa, com seu próprio try/catch e
// fallback específico — falha de API e falha de parse nunca se misturam.
export async function criarCompletionComRetry(
  openai: OpenAI,
  params: ChatCompletionCreateParamsNonStreaming,
): Promise<ChatCompletion> {
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const completion = await openai.chat.completions.create(params);
      if (completion.choices[0]?.message?.refusal) {
        throw new RecusaModeloError();
      }
      return completion;
    } catch (e) {
      ultimoErro = e;
      if (e instanceof RecusaModeloError) throw e; // recusa não se resolve tentando de novo
    }
  }
  throw ultimoErro;
}
