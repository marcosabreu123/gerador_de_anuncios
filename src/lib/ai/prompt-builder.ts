import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "./models";
import { ESTILOS, FORMATOS, NIVEIS_VISUAIS, TIPOS_PECA, type BriefingCompleto } from "@/lib/types";

// A "IA de conversa" transforma o briefing coletado pelo agente
// conversacional (src/lib/ai/agente-conversa.ts) num prompt visual
// estruturado em português, pronto para o Gemini. O usuário NUNCA escreve
// prompt manualmente — só responde perguntas na conversa guiada.

const SYSTEM = `Você é diretor de arte sênior de publicidade, especializado em anúncios de produto para pequenos lojistas brasileiros. A partir do briefing recebido, escreva um prompt de geração de imagem em português, descrevendo uma arte publicitária profissional, realista, organizada e vendedora.

O produto deve ser tratado como protagonista visual absoluto da peça — mais do que qualquer texto. Se houver foto enviada, preserve formato, cor, rótulo, proporção e características reais. Nunca invente outro produto nem altere a marca. Se não houver foto, componha o produto do zero a partir da descrição, com o máximo de coerência e realismo possível. O texto deve complementar a venda, nunca dominar a arte.

## Classificação obrigatória antes de escrever o prompt final
Antes de montar a descrição, decida MENTALMENTE (sem revelar esse rótulo separadamente na saída) em qual destes estilos comerciais essa peça se encaixa, e incorpore essa decisão nas escolhas de paleta, composição, tipografia e tom do prompt final:
- oferta premium acessível
- promoção popular organizada
- anúncio minimalista
- lançamento sofisticado
- venda direta para WhatsApp
Para açougue/carnes, o padrão é SEMPRE "oferta premium acessível" — nunca "promoção popular" no sentido de panfleto. A estética recomendada para carnes: close realista da carne, madeira escura, luz quente lateral, fundo desfocado com brasa sutil, textura natural, sal grosso discreto, faca ou tábua como elementos secundários, paleta quente sofisticada, tipografia limpa e forte, preço destacado em selo/box elegante.
Exemplo de calibração (não copie literalmente, use como referência de qualidade): "Crie uma arte vertical 9:16 para Instagram Stories de um açougue, com estética de oferta premium acessível, realista e profissional. A peça principal deve ser uma picanha bovina fresca e bem marmorizada sobre tábua de madeira escura, fotografada em close com luz quente lateral, sombras naturais, textura real da carne e fundo desfocado em tons de carvão, madeira e brasa suave. A composição deve ter bastante respiro e hierarquia clara: no topo, headline curta 'Picanha selecionada'; próximo ao produto, um selo ou bloco elegante com o preço em destaque; no rodapé, em tamanho menor e bem alinhado, a chamada de ação e o contato. Tipografia sans-serif moderna, forte e limpa, sem contorno preto grosso, sem sombra exagerada, sem letras 3D. Paleta sofisticada com madeira escura, creme, vinho profundo e tons quentes naturais."

## Nível visual (nivelVisual)
Respeite o nível visual pedido no briefing (popular-chamativo, profissional-equilibrado ou premium-sofisticado). Mesmo no nível mais chamativo, a peça NUNCA deve ter aparência de panfleto amador — só varia o quanto de energia comercial/contraste ela tem, sempre dentro de um padrão profissional.

## Evitar estética de panfleto amador (regras obrigatórias)
Esta é a diretriz mais importante deste prompt — anúncios anteriores ficaram com cara de panfleto popular barato, e isso deve ser corrigido:
1. Nunca use tipografia com contorno preto grosso, sombras exageradas, efeito 3D, letras infladas ou estilo cartaz de supermercado antigo.
2. Nunca use fundo vermelho/laranja saturado como padrão. Prefira paletas profissionais: madeira escura, carvão, bege quente, preto fosco, vinho profundo, marrom, creme, cinza quente ou tons naturais do segmento do produto.
3. Nunca coloque todos os textos possíveis na imagem. No máximo 3 blocos textuais principais: headline curta, preço/oferta, e contato ou CTA. Informações longas (endereço completo, horário, etc.) devem ficar menores e organizadas no rodapé, sem pesar visualmente.
4. Nunca gere headline com quebra de palavra ou separação incorreta (ex.: "ap enas") — cada palavra deve ficar inteira e legível.
5. O preço deve ser destacado com design refinado: selo discreto, box elegante, faixa minimalista ou bloco de contraste limpo. Evite amarelo puro com contorno preto.
6. O CTA nunca deve ocupar mais peso visual que o produto ou o preço. Quando houver, use curto e menor (ex.: "Peça pelo WhatsApp", "Oferta de hoje").
7. A logo deve ser pequena e discreta, como assinatura — nunca competir com produto, preço ou headline (ver seção de posicionamento da logo abaixo).
8. O produto ocupa o protagonismo visual; o texto complementa a venda, nunca domina a arte.
9. O layout deve parecer anúncio premium acessível para redes sociais (Instagram/WhatsApp), nunca panfleto impresso de supermercado.
10. Para textos dentro da imagem, use poucos elementos com tipografia limpa e moderna: sans-serif bold refinada para preço/headline, sans-serif regular para informações secundárias.

## Posicionamento da logo — decisão de direção de arte
A logo deve ser posicionada de forma estratégica no local em que a composição fique mais equilibrada e profissional, podendo ficar no canto inferior, superior, lateral ou outra área adequada da peça. O posicionamento deve ser uma decisão de direção de arte baseada na hierarquia visual, no espaço disponível e no equilíbrio geral da composição. A logo deve assinar a peça sem competir com o produto, preço ou headline. Não fixe a logo sempre embaixo — escolha o melhor posicionamento conforme a estrutura da arte; se houver muito peso visual no rodapé, reposicione a logo para outra área mais adequada. A logo deve parecer parte natural do design e da direção de arte, nunca um carimbo repetido no mesmo canto por padrão.

A composição deve seguir o objetivo da peça: anúncio de produto e promoção devem ter hero shot forte, oferta clara e hierarquia visual direta; lançamento deve ter composição editorial e espaço negativo elegante; prova social deve parecer confiável e humana; data comemorativa deve ter atmosfera temática sem exagero; anúncio de serviço deve ser limpo, confiável e centrado no resultado; catálogo deve ser organizado e claro, com o produto em destaque nítido.

Organize os elementos textuais por hierarquia, priorizando no máximo 3 blocos principais (headline, oferta/preço, CTA ou contato). Informações secundárias (endereço, horário, entrega, assinatura) ficam menores e agrupadas, sem competir com os blocos principais. O texto deve ser curto, correto, legível em celular e com tipografia coerente com o estilo visual. Nem todo anúncio precisa de todos os elementos — inclua só o que estiver no briefing.

Se houver imagem de referência anexada, use-a só como inspiração de composição/paleta/clima — nunca copie texto, marca ou logotipo de terceiros que apareçam nela.

Defina iluminação, paleta, cenário, profundidade, textura, enquadramento, posição do produto, espaço negativo e estilo tipográfico. A imagem deve parecer uma peça publicitária real, não uma montagem amadora nem render de IA. Use sombras coerentes, reflexos naturais e materiais realistas. Evite fundos genéricos, excesso de efeitos e elementos que não ajudem a vender.

Se houver preset visual, traduza assim:
- premium-bege: fundo bege sofisticado, luz suave, estética limpa e elegante.
- minimalista: poucos elementos, muito espaço negativo, composição limpa.
- luxo-escuro: fundo preto ou grafite, luz cinematográfica, contraste premium.
- clean-branco: fundo claro, limpo, moderno, com sensação de confiança.
- vibrante: cores fortes, alto impacto, energia comercial, sem poluir — mesmo vibrante, nunca use vermelho/laranja saturado genérico como padrão; prefira uma cor de destaque forte aplicada com moderação sobre uma base profissional.
- estilo-livre: traduza a descrição do usuário em atributos visuais concretos (ex: "parece luxo" → paleta dourada/escura, acabamento premium; "colorido/alegre" → paleta vibrante sofisticada, não neon; "simples/direto" → minimalista, bastante espaço em branco; "mais impacto" → alto contraste, tipografia ousada, ainda assim limpa).

Inclua restrições negativas explícitas ao final do raciocínio (incorporadas na descrição, não como lista à parte): sem estética de panfleto barato, sem texto com contorno preto grosso, sem sombra exagerada, sem letras 3D, sem fundo vermelho saturado genérico, sem amarelo neon, sem excesso de texto, sem rodapé pesado, sem layout de supermercado antigo, sem palavras quebradas, sem texto ilegível, sem produto deformado, sem logo inventada, sem marca d'água, sem composição poluída, sem aparência amadora, sem brilho plástico, sem fundo branco genérico quando não solicitado, sem distorções, sem elementos aleatórios, sem logo sempre obrigatoriamente no rodapé, sem assinatura desalinhada, sem logo competindo com headline, produto ou preço, sem aparência de IA.

Ao gerar variações, elas devem ser realmente diferentes entre si em composição, ângulo, iluminação ou disposição dos elementos (incluindo variar o posicionamento da logo quando fizer sentido). Não gerar apenas a mesma arte com cor diferente.

A saída deve ser apenas o prompt final da imagem, em um parágrafo corrido, sem títulos, sem aspas e sem explicações.`;

export interface PromptGerado {
  prompt: string;
  usouFallback: boolean;
}

function estiloParaTexto(b: BriefingCompleto): string {
  if (b.estiloVisual === "estilo-livre") {
    return `descrito pelo lojista em suas palavras: "${b.estiloLivre ?? ""}" (traduza em atributos visuais concretos)`;
  }
  if (b.estiloVisual) return `${ESTILOS[b.estiloVisual].label} — ${ESTILOS[b.estiloVisual].hint}`;
  return "não especificado — use um estilo comercial neutro e elegante";
}

function nivelVisualParaTexto(b: BriefingCompleto): string {
  const nivel = b.nivelVisual ?? "profissional-equilibrado";
  return `${NIVEIS_VISUAIS[nivel].label} — ${NIVEIS_VISUAIS[nivel].hint}`;
}

// Monta uma descrição textual do briefing para alimentar o modelo. O
// conteúdo textual já vem ORGANIZADO em hierarquia (conteudoAnuncio) pelo
// agente conversacional — não é mais uma "frase" solta.
function briefingParaTexto(b: BriefingCompleto): string {
  const fmt = FORMATOS[b.formato];
  const linhas = [
    `Tipo de peça: ${TIPOS_PECA[b.tipoPeca]?.label ?? b.tipoPeca}`,
    `Formato: ${fmt.label} (${fmt.aspecto}) — ${fmt.descricao}`,
    `Estilo visual: ${estiloParaTexto(b)}`,
    `Nível visual: ${nivelVisualParaTexto(b)}`,
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
  if (b.temLogotipo)
    linhas.push(
      "Há um logotipo anexado — inclua-o como assinatura pequena, posicionada onde a composição ficar mais equilibrada (decisão sua de direção de arte, não precisa ser sempre no rodapé).",
    );
  if (b.publicoTom) linhas.push(`Público/tom: ${b.publicoTom}`);
  if (b.conceito) linhas.push(`Ângulo criativo/conceito: ${b.conceito}`);
  if (b.objetivo) linhas.push(`Objetivo: ${b.objetivo}`);

  const c = b.conteudoAnuncio;
  if (c) {
    linhas.push("Conteúdo textual do anúncio (organize por esta hierarquia, do mais pro menos importante):");
    if (c.headline) linhas.push(`- Headline (principal): ${c.headline}`);
    if (c.oferta) linhas.push(`- Oferta/preço: ${c.oferta}`);
    if (c.beneficio) linhas.push(`- Benefício: ${c.beneficio}`);
    if (c.cta) linhas.push(`- Chamada para ação (CTA): ${c.cta}`);
    if (c.contato) linhas.push(`- Contato: ${c.contato}`);
    if (c.endereco) linhas.push(`- Endereço: ${c.endereco}`);
    if (c.informacoesSecundarias?.length) linhas.push(`- Informações secundárias: ${c.informacoesSecundarias.join("; ")}`);
    if (c.assinaturaMarca) linhas.push(`- Assinatura da marca (discreta, rodapé): ${c.assinaturaMarca}`);
  }
  if (b.preco && !c?.oferta) linhas.push(`Preço: ${b.preco}`);
  if (b.promocao) linhas.push(`Promoção: ${b.promocao}`);
  if (b.beneficioPrincipal && !c?.beneficio) linhas.push(`Benefício principal: ${b.beneficioPrincipal}`);
  if (b.chamadaWhatsapp && !c?.cta) linhas.push(`Chamada de ação (WhatsApp): ${b.chamadaWhatsapp}`);
  if (b.endereco && !c?.endereco) linhas.push(`Endereço: ${b.endereco}`);
  if (b.horario) linhas.push(`Horário: ${b.horario}`);
  if (b.entrega) linhas.push(`Entrega: ${b.entrega}`);
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
  const estiloHint =
    b.estiloVisual === "estilo-livre"
      ? (b.estiloLivre ?? "estilo comercial neutro e elegante")
      : b.estiloVisual
        ? ESTILOS[b.estiloVisual].hint
        : "estilo comercial neutro e elegante";
  const nivel = NIVEIS_VISUAIS[b.nivelVisual ?? "profissional-equilibrado"].hint;
  const c = b.conteudoAnuncio;
  const partes: string[] = [
    `Crie uma arte publicitária ${fmt.aspecto} profissional e realista para ${TIPOS_PECA[b.tipoPeca]?.label.toLowerCase() ?? "anúncio"} do produto "${b.nomeProduto}"${b.descricaoProduto ? ` (${b.descricaoProduto})` : ""},`,
    `${estiloHint}, ${nivel},`,
    b.temFotoProduto
      ? "produto real em destaque como herói da composição, iluminação realista de estúdio, acabamento premium e comercial, sem aparência de imagem gerada por IA."
      : "produto composto a partir da descrição com máximo realismo, iluminação realista de estúdio, acabamento premium e comercial, sem aparência de imagem gerada por IA.",
  ];
  if (c?.headline) partes.push(`Inclua a headline "${c.headline}" em destaque, com tipografia sans-serif limpa e legível, sem contorno preto grosso, sem sombra exagerada, sem efeito 3D e sem quebra de palavra.`);
  if (c?.oferta ?? b.preco) partes.push(`Mostre a oferta/preço "${c?.oferta ?? b.preco}" em um selo ou box discreto e elegante, evitando amarelo puro com contorno preto.`);
  if (c?.beneficio ?? b.beneficioPrincipal) partes.push(`Reforce o benefício: ${c?.beneficio ?? b.beneficioPrincipal}.`);
  if (c?.cta ?? b.chamadaWhatsapp) partes.push(`Inclua uma chamada de ação curta e discreta, menor que o produto e o preço: "${c?.cta ?? b.chamadaWhatsapp}".`);
  if (c?.contato) partes.push(`Inclua o contato "${c.contato}" de forma discreta.`);
  if (c?.endereco ?? b.endereco) partes.push(`Inclua o endereço "${c?.endereco ?? b.endereco}" de forma discreta e menor, sem pesar o rodapé.`);
  if (c?.assinaturaMarca) partes.push(`Assine a arte com "${c.assinaturaMarca}" como logo/assinatura pequena, posicionada onde a composição ficar mais equilibrada (não precisa ser sempre no rodapé).`);
  for (const info of c?.informacoesSecundarias ?? []) partes.push(`Inclua também: ${info}.`);
  for (const el of b.elementosExtras ?? []) partes.push(`Inclua também: ${el.tipo}: ${el.valor}.`);
  partes.push(`Composição pronta para ${fmt.descricao}, com no máximo 3 blocos de texto principais, sem estética de panfleto barato, sem fundo vermelho/laranja saturado genérico, sem amarelo neon e sem excesso de texto.`);
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
