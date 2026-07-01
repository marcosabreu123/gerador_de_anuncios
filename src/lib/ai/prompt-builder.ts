import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "./models";
import { ESTILOS, FORMATOS, type BriefingCompleto } from "@/lib/types";

// A "IA de conversa" (GPT-4.1 mini) transforma as respostas do formulário
// guiado num prompt visual estruturado em português, pronto para o Gemini.
// O usuário NUNCA escreve prompt manualmente — só responde perguntas.

const SYSTEM = `Você é diretor de arte de publicidade especializado em anúncios de produto para pequenos lojistas brasileiros (Instagram, WhatsApp, tráfego pago).
Sua tarefa: escrever UM prompt de geração de imagem, em português, descrevendo uma arte publicitária profissional a partir do briefing.

Regras do prompt:
- Estética realista, premium e comercial. Nada de "cara de IA".
- O produto enviado na foto é o herói: mantenha suas características reais (formato, cor, rótulo). Não invente outro produto.
- Descreva fundo, iluminação, composição e enquadramento coerentes com o formato e o estilo pedidos.
- Se houver preço, frase ou chamada, posicione como texto legível e elegante na arte (ex.: preço na parte inferior, chamada comercial clara). Tipografia sofisticada.
- Texto na imagem deve ser curto, correto e em português.
- Saída: apenas o prompt final em um parágrafo. Sem títulos, sem aspas, sem explicações.`;

export interface PromptGerado {
  prompt: string;
  usouFallback: boolean;
}

// Monta uma descrição textual do briefing para alimentar o modelo.
function briefingParaTexto(b: BriefingCompleto): string {
  const fmt = FORMATOS[b.formato];
  const est = ESTILOS[b.estilo];
  const linhas = [
    `Formato: ${fmt.label} (${fmt.aspecto}) — ${fmt.descricao}`,
    `Estilo visual: ${est.label} — ${est.hint}`,
    `Produto: ${b.nomeProduto}`,
  ];
  if (b.preco) linhas.push(`Preço: ${b.preco}`);
  if (b.frase) linhas.push(`Frase/gancho: ${b.frase}`);
  if (b.beneficio) linhas.push(`Benefício principal: ${b.beneficio}`);
  if (b.chamadaWhatsapp) linhas.push(`Chamada de ação (WhatsApp): ${b.chamadaWhatsapp}`);
  if (b.objetivo) linhas.push(`Objetivo: ${b.objetivo}`);
  return linhas.join("\n");
}

// Fallback determinístico caso a OPENAI_API_KEY não esteja configurada.
// Garante que o fluxo funciona ponta a ponta mesmo sem a IA de conversa.
export function montarPromptFallback(b: BriefingCompleto): string {
  const fmt = FORMATOS[b.formato];
  const est = ESTILOS[b.estilo];
  const partes: string[] = [
    `Crie uma arte publicitária ${fmt.aspecto} profissional e realista para anúncio do produto "${b.nomeProduto}",`,
    `${est.hint},`,
    "produto real em destaque como herói da composição, iluminação realista de estúdio, acabamento premium e comercial, sem aparência de imagem gerada por IA.",
  ];
  if (b.frase) partes.push(`Inclua a frase "${b.frase}" com tipografia elegante e legível.`);
  if (b.beneficio) partes.push(`Reforce o benefício: ${b.beneficio}.`);
  if (b.preco) partes.push(`Mostre o preço ${b.preco} de forma clara e legível na parte inferior.`);
  if (b.chamadaWhatsapp) partes.push(`Inclua a chamada comercial: "${b.chamadaWhatsapp}".`);
  partes.push(`Composição pronta para ${fmt.descricao}.`);
  return partes.join(" ");
}

export async function montarPrompt(b: BriefingCompleto): Promise<PromptGerado> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { prompt: montarPromptFallback(b), usouFallback: true };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: briefingParaTexto(b) },
      ],
    });
    const prompt = completion.choices[0]?.message?.content?.trim();
    if (!prompt) return { prompt: montarPromptFallback(b), usouFallback: true };
    return { prompt, usouFallback: false };
  } catch (e) {
    console.error("[prompt-builder] OpenAI falhou, usando fallback:", e);
    return { prompt: montarPromptFallback(b), usouFallback: true };
  }
}

// Reinterpreta um pedido de ajuste em linguagem natural sobre uma arte já gerada,
// combinando com o prompt anterior para gerar um novo prompt de edição.
export async function montarPromptAjuste(
  promptAnterior: string,
  pedidoUsuario: string,
): Promise<PromptGerado> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = `${promptAnterior}\n\nAJUSTE SOLICITADO: ${pedidoUsuario}. Mantenha o produto e a identidade da arte, aplicando apenas o ajuste pedido.`;
  if (!apiKey) return { prompt: fallback, usouFallback: true };

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      temperature: 0.6,
      messages: [
        {
          role: "system",
          content:
            "Você reescreve prompts de arte publicitária. Receba o prompt anterior e um pedido de ajuste do lojista (linguagem simples). Devolva UM novo prompt em português que mantém o produto e a identidade da arte e aplica o ajuste. Apenas o prompt final, sem aspas.",
        },
        {
          role: "user",
          content: `PROMPT ANTERIOR:\n${promptAnterior}\n\nPEDIDO DE AJUSTE:\n${pedidoUsuario}`,
        },
      ],
    });
    const prompt = completion.choices[0]?.message?.content?.trim();
    if (!prompt) return { prompt: fallback, usouFallback: true };
    return { prompt, usouFallback: false };
  } catch (e) {
    console.error("[prompt-builder] ajuste OpenAI falhou, usando fallback:", e);
    return { prompt: fallback, usouFallback: true };
  }
}
