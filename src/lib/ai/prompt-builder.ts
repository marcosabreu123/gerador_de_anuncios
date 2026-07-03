import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "./models";
import { ESTILOS, FORMATOS, TIPOS_PECA, type BriefingCompleto } from "@/lib/types";

// A "IA de conversa" (GPT-4.1 mini) transforma o briefing coletado pelo
// agente conversacional (src/lib/ai/agente-conversa.ts) num prompt visual
// estruturado em português, pronto para o Gemini. O usuário NUNCA escreve
// prompt manualmente — só responde perguntas na conversa guiada.

const SYSTEM = `Você é diretor de arte sênior de publicidade, especializado em anúncios de produto para pequenos lojistas brasileiros (Instagram, WhatsApp, tráfego pago). Sua tarefa: a partir do briefing, escrever UM prompt de geração de imagem, em português, descrevendo uma arte publicitária profissional, realista e vendedora.

Trate cada elemento:
- PRODUTO HERÓI: se houver foto do produto, ela é o protagonista — preserve características reais (formato, cor, rótulo, proporção); nunca invente outro produto nem altere a marca. Se não houver foto, componha o produto do zero a partir da descrição, com o máximo de coerência e realismo possível.
- REFERÊNCIA DE ESTILO: se houver uma imagem de referência anexada, use-a apenas como inspiração de composição/paleta/clima visual — nunca copie texto, marca ou logotipo de terceiros que apareçam nela.
- LOGOTIPO: se houver logotipo anexado, inclua-o de forma discreta e legível na arte (ex.: canto inferior), sem distorcer suas proporções ou cores.
- COMPOSIÇÃO: enquadramento e regra de terços coerentes com o formato (9:16 vertical, 4:5, 1:1). Respiro adequado; produto com peso visual.
- ILUMINAÇÃO: luz realista de estúdio/produto, sombras coerentes, reflexos naturais. Nada de aparência artificial ou "cara de IA".
- PALETA E ESTILO: siga o estilo pedido de forma consistente.
- TIPOGRAFIA E HIERARQUIA: se houver headline, preço e chamada, organize a hierarquia (headline > preço > CTA), tipografia elegante, alto contraste e legibilidade. Texto curto, correto e em português.
- RESTRIÇÕES: sem texto quebrado ou ilegível, sem marcas d'água, sem logos inventadas (a não ser a anexada), sem elementos aleatórios, sem estética de IA genérica.

Saída: apenas o prompt final, em um parágrafo corrido. Sem títulos, sem aspas, sem explicações.`;

export interface PromptGerado {
  prompt: string;
  usouFallback: boolean;
}

// Monta uma descrição textual do briefing para alimentar o modelo.
function briefingParaTexto(b: BriefingCompleto): string {
  const fmt = FORMATOS[b.formato];
  const est = ESTILOS[b.estilo];
  const linhas = [
    `Tipo de peça: ${TIPOS_PECA[b.tipoPeca]?.label ?? b.tipoPeca}`,
    `Formato: ${fmt.label} (${fmt.aspecto}) — ${fmt.descricao}`,
    `Estilo visual: ${est.label} — ${est.hint}`,
    `Produto: ${b.nomeProduto}`,
  ];
  if (b.descricaoProduto) linhas.push(`Descrição do produto: ${b.descricaoProduto}`);
  if (b.detalhesVisuaisProduto) linhas.push(`Detalhes visuais reais do produto: ${b.detalhesVisuaisProduto}`);
  linhas.push(
    b.temFotoProduto
      ? "Há uma foto real do produto anexada — use-a como base fiel."
      : "NÃO há foto do produto — componha a partir da descrição, com o máximo de realismo possível.",
  );
  if (b.temReferencia) linhas.push("Há uma imagem de referência de estilo anexada — inspire-se nela.");
  if (b.temLogotipo) linhas.push("Há um logotipo anexado — inclua-o discretamente na arte.");
  if (b.publicoTom) linhas.push(`Público/tom: ${b.publicoTom}`);
  if (b.conceito) linhas.push(`Ângulo criativo/conceito: ${b.conceito}`);
  if (b.preco) linhas.push(`Preço: ${b.preco}`);
  if (b.frase) linhas.push(`Frase/headline: ${b.frase}`);
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
    `Crie uma arte publicitária ${fmt.aspecto} profissional e realista para ${TIPOS_PECA[b.tipoPeca]?.label.toLowerCase() ?? "anúncio"} do produto "${b.nomeProduto}"${b.descricaoProduto ? ` (${b.descricaoProduto})` : ""},`,
    `${est.hint},`,
    b.temFotoProduto
      ? "produto real em destaque como herói da composição, iluminação realista de estúdio, acabamento premium e comercial, sem aparência de imagem gerada por IA."
      : "produto composto a partir da descrição com máximo realismo, iluminação realista de estúdio, acabamento premium e comercial, sem aparência de imagem gerada por IA.",
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

// Fluxo de edição direta (/editar): o lojista sobe um design PRONTO (feito
// fora do app, sem briefing/prompt anterior nosso) e pede uma mudança em
// linguagem natural. Diferente de montarPromptAjuste, aqui não existe
// "prompt anterior" — só a imagem em si e o pedido.
export async function montarPromptEdicaoDireta(pedidoUsuario: string): Promise<PromptGerado> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = `Edite a imagem enviada aplicando exatamente este pedido: ${pedidoUsuario}. Preserve o restante do design (produto, textos, composição, marca) tal como está, mudando apenas o que foi pedido. Mantenha alta qualidade e realismo.`;
  if (!apiKey) return { prompt: fallback, usouFallback: true };

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            "Você escreve instruções de edição de imagem para um modelo de geração. O lojista enviou um design pronto (uma arte publicitária já existente) e pediu uma mudança em linguagem simples. Escreva UM prompt de edição em português, claro e específico, que aplica exatamente o pedido e instrui a preservar tudo o mais (produto, textos, composição, marca) como está na imagem original. Apenas o prompt final, sem aspas, sem explicações.",
        },
        { role: "user", content: `PEDIDO DE EDIÇÃO:\n${pedidoUsuario}` },
      ],
    });
    const prompt = completion.choices[0]?.message?.content?.trim();
    if (!prompt) return { prompt: fallback, usouFallback: true };
    return { prompt, usouFallback: false };
  } catch (e) {
    console.error("[prompt-builder] edição direta OpenAI falhou, usando fallback:", e);
    return { prompt: fallback, usouFallback: true };
  }
}
