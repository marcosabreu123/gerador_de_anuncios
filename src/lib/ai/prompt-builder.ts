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
- COMPOSIÇÃO POR OBJETIVO: adapte a composição ao tipo de peça:
  - anúncio de produto / promoção → hero shot dinâmico do produto, hierarquia visual forte, senso de urgência quando for promoção
  - lançamento / prova social → composição editorial, espaço negativo elegante, sensação premium
  - data comemorativa → atmosfera festiva, tipografia em destaque, alto contraste
  - anúncio de serviço → composição limpa, confiável, centrada no resultado/benefício
  Enquadramento e regra de terços coerentes com o formato (9:16 vertical, 4:5, 1:1). Respiro adequado; produto com peso visual.
- ILUMINAÇÃO: luz realista de estúdio/produto, sombras coerentes, reflexos naturais. Nada de aparência artificial ou "cara de IA".
- PALETA E ESTILO: se houver um estilo preset, siga-o de forma consistente. Se houver uma descrição livre de estilo, traduza-a em atributos visuais concretos antes de compor o prompt — ex: "parece luxo" → paleta dourada/escura, acabamento premium; "colorido/alegre" → paleta vibrante, composição descontraída; "simples/direto" → layout minimalista, bastante espaço em branco; "mais impacto" → alto contraste, tipografia ousada.
- IDENTIDADE VISUAL: se houver logotipo ou imagem de referência anexados, extraia mentalmente as cores predominantes e o estilo tipográfico percebido, e mantenha consistência com essa identidade ao longo da arte. Posicione o logotipo (se houver) num canto discreto, sem competir com o produto. Se houver referência de estilo, use-a só como inspiração de composição/paleta/clima — nunca copie texto, marca ou logotipo de terceiros que apareçam nela.
- TIPOGRAFIA E HIERARQUIA: organize a hierarquia de todos os elementos textuais presentes no briefing (headline, preço, contato, endereço, horário, promoção, ou qualquer outro item informado), do mais importante pro menos importante. Tipografia elegante, alto contraste e legibilidade. Texto curto, correto e em português. Nem todo anúncio precisa de todos os elementos — inclua só o que estiver no briefing.
- RESTRIÇÕES: sem marcas d'água, sem texto quebrado ou ilegível, sem elementos distorcidos, sem aparência amadora, sem "cara de banco de imagens", sem fundo branco genérico, sem composição entediante, sem logos inventadas (a não ser a anexada).
- VARIAÇÃO ENTRE AS ARTES: este prompt pode ser usado para gerar mais de uma variação da mesma arte — garanta que a descrição permita variações visivelmente diferentes entre si em composição, ângulo ou iluminação (não a mesma arte só com a cor trocada).

Saída: apenas o prompt final, em um parágrafo corrido. Sem títulos, sem aspas, sem explicações.`;

export interface PromptGerado {
  prompt: string;
  usouFallback: boolean;
}

function estiloParaTexto(b: BriefingCompleto): string {
  if (b.estilo) return `${ESTILOS[b.estilo].label} — ${ESTILOS[b.estilo].hint}`;
  if (b.estiloLivre) return `descrito pelo lojista em suas palavras: "${b.estiloLivre}" (traduza em atributos visuais concretos)`;
  return "não especificado — use um estilo comercial neutro e elegante";
}

// Monta uma descrição textual do briefing para alimentar o modelo.
function briefingParaTexto(b: BriefingCompleto): string {
  const fmt = FORMATOS[b.formato];
  const linhas = [
    `Tipo de peça: ${TIPOS_PECA[b.tipoPeca]?.label ?? b.tipoPeca}`,
    `Formato: ${fmt.label} (${fmt.aspecto}) — ${fmt.descricao}`,
    `Estilo visual: ${estiloParaTexto(b)}`,
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
  if (b.elementosExtras?.length) {
    linhas.push("Elementos adicionais do anúncio:");
    for (const el of b.elementosExtras) linhas.push(`- ${el.tipo}: ${el.valor}`);
  }
  if (b.perguntasSegmento?.length) {
    linhas.push("Contexto específico do nicho (perguntas e respostas do lojista):");
    for (const p of b.perguntasSegmento) linhas.push(`- ${p.pergunta}: ${p.resposta}`);
  }
  return linhas.join("\n");
}

// Fallback determinístico caso a OPENAI_API_KEY não esteja configurada.
// Garante que o fluxo funciona ponta a ponta mesmo sem a IA de conversa.
export function montarPromptFallback(b: BriefingCompleto): string {
  const fmt = FORMATOS[b.formato];
  const estiloHint = b.estilo ? ESTILOS[b.estilo].hint : (b.estiloLivre ?? "estilo comercial neutro e elegante");
  const partes: string[] = [
    `Crie uma arte publicitária ${fmt.aspecto} profissional e realista para ${TIPOS_PECA[b.tipoPeca]?.label.toLowerCase() ?? "anúncio"} do produto "${b.nomeProduto}"${b.descricaoProduto ? ` (${b.descricaoProduto})` : ""},`,
    `${estiloHint},`,
    b.temFotoProduto
      ? "produto real em destaque como herói da composição, iluminação realista de estúdio, acabamento premium e comercial, sem aparência de imagem gerada por IA."
      : "produto composto a partir da descrição com máximo realismo, iluminação realista de estúdio, acabamento premium e comercial, sem aparência de imagem gerada por IA.",
  ];
  if (b.frase) partes.push(`Inclua a frase "${b.frase}" com tipografia elegante e legível.`);
  if (b.beneficio) partes.push(`Reforce o benefício: ${b.beneficio}.`);
  if (b.preco) partes.push(`Mostre o preço ${b.preco} de forma clara e legível na parte inferior.`);
  if (b.chamadaWhatsapp) partes.push(`Inclua a chamada comercial: "${b.chamadaWhatsapp}".`);
  for (const el of b.elementosExtras ?? []) partes.push(`Inclua também: ${el.tipo}: ${el.valor}.`);
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
// Curto e direto por design: ajustes devem mudar só o que foi pedido.
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
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content:
            'Você reescreve prompts de arte publicitária para aplicar um ajuste pontual. Receba o prompt anterior e um pedido de ajuste do lojista (linguagem simples). Devolva UM novo prompt em português, curto e direto (no máximo 2 frases), no formato: "Altere [elemento específico] para [novo valor]. Mantenha todo o restante exatamente igual." Nunca mude elementos que o lojista não pediu. Apenas o prompt final, sem aspas.',
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

export type TipoPedidoAjuste = "ajuste" | "nova-criacao" | "ambiguo";

export interface ClassificacaoAjuste {
  tipo: TipoPedidoAjuste;
  resumo: string; // frase curta descrevendo o que vai mudar, para confirmação
}

// Decide se um pedido em linguagem natural sobre uma arte já gerada é um
// AJUSTE pontual (chamar /api/adjust) ou parece uma NOVA CRIAÇÃO disfarçada
// (o lojista deveria recomeçar o briefing). Roda antes de gastar 1 crédito.
export async function classificarPedidoAjuste(pedido: string): Promise<ClassificacaoAjuste> {
  const apiKey = process.env.OPENAI_API_KEY;
  // Fallback heurístico simples caso a IA não esteja configurada/disponível.
  const heuristicaNovaCríacao = /\b(refaz|refazer|refeito|n[aã]o gostei|cria outra|completamente diferente|come[cç]a de novo|do zero)\b/i;
  if (!apiKey) {
    return heuristicaNovaCríacao.test(pedido)
      ? { tipo: "nova-criacao", resumo: pedido }
      : { tipo: "ajuste", resumo: pedido };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'Classifique um pedido de mudança sobre uma arte publicitária já gerada. Responda em JSON: {"tipo": "ajuste" | "nova-criacao" | "ambiguo", "resumo": "frase curta e específica descrevendo exatamente o que vai mudar, em português"}. ' +
            '"ajuste" = mudança pontual e específica (ex: trocar preço, cor de fundo, tamanho de texto). ' +
            '"nova-criacao" = o lojista quer recomeçar ou não gostou do resultado (ex: "refaz tudo", "não gostei", "cria outra completamente diferente"). ' +
            '"ambiguo" = o pedido muda vários elementos ao mesmo tempo (produto, formato E estilo, por exemplo) e pode ser tanto um ajuste grande quanto uma nova criação.',
        },
        { role: "user", content: pedido },
      ],
    });
    const texto = completion.choices[0]?.message?.content;
    if (!texto) return { tipo: "ajuste", resumo: pedido };
    const j = JSON.parse(texto);
    const tipo: TipoPedidoAjuste = ["ajuste", "nova-criacao", "ambiguo"].includes(j.tipo) ? j.tipo : "ajuste";
    const resumo = typeof j.resumo === "string" && j.resumo.trim() ? j.resumo.trim() : pedido;
    return { tipo, resumo };
  } catch (e) {
    console.error("[prompt-builder] classificação de ajuste falhou:", e);
    return { tipo: "ajuste", resumo: pedido };
  }
}
