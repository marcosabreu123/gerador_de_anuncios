import OpenAI from "openai";
import { TEXT_PROMPT_BUILDER_MODEL } from "./models";
import type { EntradaImagem } from "./openai-image";
import type { PromptGerado } from "./prompt-builder";

// Ordem de edição do botão de ajuste: o que o operador pediu muda, e o resto da
// arte fica como está.
//
// Quem escreve a ordem VÊ a arte. A versão anterior só lia o prompt que gerou a
// peça e mandava ao gerador uma lista de trinta itens a preservar, mais um bloco de
// realismo de comida. A arte voltava igual, sem erro nenhum: testado com "eu queria
// o entregador em formato de desenho", ele só mudou com ordem curta e qualidade
// "medium". Por isso aqui a mudança vem primeiro e o que fica cabe numa frase.

const SYSTEM_AJUSTE = `Você é o finalizador de uma agência de publicidade. Recebe uma arte pronta e o pedido de mudança do operador, e escreve a ordem de edição que vai para o gerador de imagem.

O gerador refaz a imagem inteira a partir da arte. Ordem vaga faz ele devolver a arte igual, e ordem ampla faz ele mexer no que já estava certo. Escreva curto e concreto.

Responda SOMENTE com um objeto JSON:
{
  "mudanca": "como a arte deve ficar depois da edição",
  "manter": "o que fica igual"
}

Em "mudanca":
- Cubra tudo o que o pedido mandou e nada além disso.
- Olhe a arte e nomeie cada elemento como ele aparece nela, dizendo onde está.
- Descreva o resultado, não a intenção. "Em formato de desenho" vira "ilustração 2D de desenho animado, com contorno preto marcado, cores chapadas e sombras simples". "Fundo mais escuro" diz qual fundo e o quanto.
- Pedido de tamanho sem número vira número: "maior" é cerca de 30% maior, e "um pouco maior" é cerca de 15%.
- Texto novo vai entre aspas, exatamente como o operador escreveu, dizendo qual texto da arte ele substitui ou onde ele entra.
- Inclua só o que deixaria a cena errada se não mudasse junto: o entregador em desenho leva junto a moto em que ele está.
- Use o espaço livre da arte. Só mova algo se o que foi pedido não couber. Mova texto primeiro: foto, pessoa e produto só saem do lugar se o pedido falar deles ou se for o único jeito.
- Texto nunca cai em cima de pessoa, produto ou outro texto.
- Pedido de estilo sem alvo, como "mais clean" ou "mais premium", mexe em fundo, efeitos e respiro. Produto, acompanhamento, texto e logo continuam na arte.
- Comida só deixa de parecer de verdade se o pedido mandar.

Em "manter":
- Uma frase curta, de até 30 palavras, com as partes da arte que ficam iguais. Por exemplo: o fundo, os demais textos, a logo, e a posição e o tamanho do que não mudou.
- Não cite nada que esteja em "mudanca".
- Não copie os textos da arte.`;

function ordemDeEdicao(mudanca: string, manter: string): string {
  return `Edite esta arte. Mudança obrigatória: ${mudanca}

Essa mudança é o motivo da edição: ela precisa aparecer no resultado.

Mantenha igual: ${manter}`;
}

export async function montarOrdemDeAjuste(arte: EntradaImagem, pedido: string): Promise<PromptGerado> {
  const fallback = ordemDeEdicao(
    pedido,
    "tudo o que o pedido não citou, inclusive os demais textos, a logo e a posição dos elementos.",
  );
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { prompt: fallback, usouFallback: true };

  // Sem repetição: 30s aqui mais os 85s da imagem cabem nos 120s do worker, e a
  // ordem levou até 15s nos testes. Se falhar, o pedido vai como veio.
  const openai = new OpenAI({ apiKey, timeout: 30_000, maxRetries: 0 });
  try {
    const completion = await openai.chat.completions.create({
      model: TEXT_PROMPT_BUILDER_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_AJUSTE },
        {
          role: "user",
          content: [
            { type: "text", text: `PEDIDO DO OPERADOR:\n${pedido}` },
            {
              type: "image_url",
              image_url: { url: `data:${arte.mimeType};base64,${arte.base64}`, detail: "high" },
            },
          ],
        },
      ],
    });

    const uso = {
      modelo: TEXT_PROMPT_BUILDER_MODEL,
      entrada: completion.usage?.prompt_tokens ?? 0,
      saida: completion.usage?.completion_tokens ?? 0,
    };
    const { mudanca, manter } = JSON.parse(completion.choices[0]?.message?.content ?? "{}") as Record<string, unknown>;
    if (typeof mudanca !== "string" || !mudanca.trim()) return { prompt: fallback, usouFallback: true, uso };

    return {
      prompt: ordemDeEdicao(mudanca.trim(), typeof manter === "string" && manter.trim() ? manter.trim() : "o resto da arte."),
      usouFallback: false,
      uso,
    };
  } catch (e) {
    console.error("[ajuste-arte] falha ao escrever a ordem, usando o pedido como veio:", e);
    return { prompt: fallback, usouFallback: true };
  }
}
