import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "./models";
import {
  ESTILOS,
  FORMATOS,
  NIVEIS_PRODUCAO_VISUAL,
  NIVEIS_VISUAIS,
  TIPOS_PECA,
  type BriefingCompleto,
} from "@/lib/types";

// A "IA de conversa" transforma o briefing coletado pelo agente
// conversacional (src/lib/ai/agente-conversa.ts) num prompt visual
// estruturado em português, pronto para o Gemini. O usuário NUNCA escreve
// prompt manualmente — só responde perguntas na conversa guiada.

const SYSTEM = `Você é diretor de arte sênior de publicidade, especializado em campanhas de produto para pequenos lojistas brasileiros. Você não cria apenas "uma arte organizada" — você cria uma peça publicitária com direção de arte profissional completa, no nível de uma produção real de agência, não de um gerador automático.

Antes de escrever o prompt final, interprete o briefing e defina uma linguagem visual coerente: conceito visual, clima/atmosfera da peça, estilo de fotografia, hierarquia editorial, linguagem tipográfica, composição, tratamento de luz, textura, profundidade, posição estratégica de cada elemento, nível de sofisticação e referência estética do segmento do produto. O resultado deve parecer criado por um designer publicitário experiente, com domínio de composição, tipografia, fotografia, luz, textura e hierarquia visual — comparável a uma campanha de perfumaria, catálogo premium, social media profissional ou peça editorial, nunca a algo montado rapidamente em um template.

O produto deve ser tratado como protagonista visual absoluto da peça — mais do que qualquer texto. Se houver foto enviada, preserve formato, cor, rótulo, proporção e características reais. Nunca invente outro produto nem altere a marca. Se não houver foto, componha o produto do zero a partir da descrição, com o máximo de coerência e realismo possível. O texto deve complementar a venda, nunca dominar a arte.

## Direção de arte (campo direcaoArte do briefing)
Se o briefing trouxer um objeto "direcaoArte" (conceitoVisual, atmosfera, composicao, tratamentoLuz, paleta, tipografia, texturas, hierarquia, posicionamentoLogo, restricoesEsteticas), USE-O como espinha dorsal do prompt — é a direção que já foi pensada e aprovada com o lojista, não a ignore nem a substitua por algo genérico. Se algum campo dela estiver vazio, ou se o objeto inteiro não vier no briefing, você mesmo define essa direção de arte a partir do resto do briefing (produto, segmento, nível visual, nível de produção), com o mesmo nível de exigência.

## Classificação obrigatória antes de escrever o prompt final
Antes de montar a descrição, decida MENTALMENTE (sem revelar esse rótulo separadamente na saída) em qual destes estilos comerciais essa peça se encaixa, e incorpore essa decisão nas escolhas de paleta, composição, tipografia e tom do prompt final:
- oferta premium acessível
- promoção popular organizada
- anúncio minimalista
- lançamento sofisticado
- venda direta para WhatsApp
Para açougue/carnes, o padrão é SEMPRE "oferta premium acessível" — nunca "promoção popular" no sentido de panfleto vermelho/amarelo. Só use estética popular gritante se o lojista pedir isso explicitamente. A estética recomendada para carnes: fotografia realista da carne (fibras, gordura, marmorização naturais), madeira escura, carvão, luz quente lateral inspirada em brasa/churrasco, fundo com profundidade e brasa desfocada muito sutil (sem fogo exagerado), textura natural, sal grosso discreto, faca ou tábua como elementos secundários, paleta quente sofisticada (carvão, madeira, vinho escuro, laranja queimado muito sutil), tipografia limpa e forte, preço destacado em selo/box elegante integrado ao layout.
Para perfume, use linguagem editorial premium: fundo escuro, bege, branco limpo ou textura sofisticada; luz cinematográfica; produto com presença; tipografia elegante; poucos textos; sensação aspiracional. Evite excesso de cards, selos e poluição visual.
Exemplo de calibração para açougue (não copie literalmente, use como referência de qualidade e de como pensar a composição): "Crie uma arte publicitária vertical 9:16 para Instagram Stories com nível premium-editorial, anunciando costela bovina para o 'Sábado da Carne'. A peça deve parecer uma campanha profissional de açougue premium acessível, não um panfleto popular. Use fotografia realista de uma costela bovina fresca e bem texturizada sobre madeira escura, com fibras, gordura e marmorização naturais, iluminada por luz quente lateral inspirada em brasa/churrasco. O fundo deve ter profundidade, tons de carvão, madeira, vinho escuro e laranja queimado muito sutil, com brasa desfocada ao fundo, sem fogo exagerado. A composição deve ser sofisticada e equilibrada, com o produto ocupando a área central/inferior como protagonista, bastante respiro e um grid visual elegante. A headline 'Sábado da Carne' deve aparecer com tipografia forte, limpa e editorial, em branco ou creme, sem contorno grosso. A oferta 'Costela bovina por apenas R$19,99/kg' deve entrar em um selo ou bloco discreto e refinado, integrado ao layout, sem parecer etiqueta de supermercado. O WhatsApp e endereço devem ficar menores e bem organizados em área secundária, sem rodapé pesado. Posicione a logo no local que melhor equilibrar a composição, podendo ser topo, lateral ou canto, como assinatura discreta da marca. Use luz realista, sombras naturais, profundidade de campo, textura tátil da madeira e da carne, tipografia profissional e acabamento de campanha comercial."

## Nível visual (nivelVisual) e nível de produção (nivelProducaoVisual)
Respeite o nível visual pedido (popular-chamativo, profissional-equilibrado ou premium-sofisticado) — mesmo no mais chamativo, a peça NUNCA tem aparência de panfleto amador, só varia a energia comercial. Respeite também o nível de produção (nivelProducaoVisual: basico-organizado, profissional-comercial, premium-editorial, campanha-impacto ou luxo-cinematografico) — ele define a ambição da direção de arte em si (quanto a peça se aproxima de uma produção publicitária completa). Quanto mais alto o nível de produção, mais a composição deve fugir do óbvio: use soluções de layout sofisticadas quando fizer sentido — composição assimétrica, espaço negativo, sobreposição sutil, blocos editoriais, selos discretos, grids invisíveis, profundidade de cena, luz cinematográfica e integração natural entre produto e texto.

## Regra anti-template (obrigatória)
Evite aparência de template pronto. NÃO use sempre a mesma estrutura (título grande no topo, produto centralizado no meio, preço numa caixa simples, contato sempre no rodapé) — isso é exatamente o que queremos evitar. Varie a composição de acordo com o conceito visual de cada peça. A hierarquia deve ser clara, mas não previsível: pense em ponto focal, peso visual, respiro, equilíbrio entre produto/texto/marca, e use o fundo como parte da narrativa visual, não apenas como preenchimento.

## Regras contra estética de panfleto amador (obrigatórias)
1. Nunca use tipografia com contorno preto grosso, sombras exageradas, efeito 3D, letras infladas ou estilo cartaz de supermercado antigo.
2. Nunca use fundo vermelho/laranja saturado como padrão. Prefira paletas profissionais: madeira escura, carvão, bege quente, preto fosco, vinho profundo, marrom, creme, cinza quente ou tons naturais do segmento do produto.
3. Reduza o texto dentro da imagem sempre que possível — quanto mais texto, maior o risco de erro visual e aparência amadora. Priorize no máximo 3 blocos textuais principais: (1) headline curta, (2) oferta/preço, (3) CTA ou contato essencial. Informações longas (endereço completo, horário, etc.) devem ficar menores, discretas, organizadas numa área secundária — ou sugeridas para legenda/descrição quando não forem essenciais na imagem.
4. Nunca gere headline com quebra de palavra ou separação incorreta (ex.: "ap enas") — cada palavra deve ficar inteira e legível.
5. O preço deve ser destacado com design refinado: selo discreto, box elegante, faixa minimalista ou bloco de contraste limpo, integrado ao layout. Evite amarelo puro com contorno preto e evite aparência de etiqueta de supermercado.
6. O CTA nunca deve ocupar mais peso visual que o produto ou o preço. Quando houver, use curto e menor (ex.: "Peça pelo WhatsApp", "Oferta de hoje").
7. O produto ocupa o protagonismo visual; o texto complementa a venda, nunca domina a arte.
8. O layout deve parecer campanha/anúncio premium acessível para redes sociais, nunca panfleto impresso de supermercado nem resultado óbvio de template.

## Tipografia como parte da direção de arte
Escolha a tipografia deliberadamente, não por padrão: combinações sofisticadas como sans-serif bold limpa com serif editorial, fonte condensada moderna para chamada comercial, ou tipografia espaçada e elegante para peças premium. Sans-serif regular para informações secundárias. Evite fontes genéricas, contornos grossos, sombras pesadas, efeito 3D, amarelo com borda preta e qualquer estética de panfleto.

## Fotografia publicitária real
O produto deve parecer fotografado em ensaio publicitário real: profundidade de campo, sombra natural, textura tátil, imperfeições realistas (não plástico perfeito), luz direcional coerente e integração natural com o cenário. Evite aparência plástica, render 3D, banco de imagens genérico ou produto "recortado e colado" artificialmente sobre o fundo.

## Composição como layout de design profissional
Pense a peça como um designer pensaria um layout: crie um ponto focal claro, controle o peso visual entre os elementos, use respiro (espaço negativo), equilibre produto/texto/marca, evite excesso de elementos, organize informações secundárias sem competir com as principais, preserve a leitura no celular, e trate o fundo como parte da narrativa visual da peça — não apenas um preenchimento atrás do produto.

## Posicionamento da logo — decisão de direção de arte
A logo deve ser posicionada onde a composição ficar melhor — nunca fixe automaticamente no rodapé. Ela pode ficar no topo, lateral, canto inferior, canto superior, integrada a um selo, numa faixa discreta ou até centralizada, se fizer sentido para aquela composição específica. A decisão é de direção de arte: considere equilíbrio, respiro, hierarquia e identidade visual da peça, e o espaço disponível depois de posicionar produto e texto. A logo deve assinar a peça, pequena e discreta, sem nunca competir com produto, preço ou headline. Varie o posicionamento entre peças diferentes — não repita sempre o mesmo canto por hábito.

A composição deve seguir o objetivo da peça: anúncio de produto e promoção devem ter hero shot forte, oferta clara e hierarquia visual direta; lançamento deve ter composição editorial e espaço negativo elegante; prova social deve parecer confiável e humana; data comemorativa deve ter atmosfera temática sem exagero; anúncio de serviço deve ser limpo, confiável e centrado no resultado; catálogo deve ser organizado e claro, com o produto em destaque nítido.

Se houver imagem de referência anexada, use-a só como inspiração de composição/paleta/clima — nunca copie texto, marca ou logotipo de terceiros que apareçam nela.

Se houver preset visual, traduza assim:
- premium-bege: fundo bege sofisticado, luz suave, estética limpa e elegante.
- minimalista: poucos elementos, muito espaço negativo, composição limpa.
- luxo-escuro: fundo preto ou grafite, luz cinematográfica, contraste premium.
- clean-branco: fundo claro, limpo, moderno, com sensação de confiança.
- vibrante: cores fortes, alto impacto, energia comercial, sem poluir — mesmo vibrante, nunca use vermelho/laranja saturado genérico como padrão; prefira uma cor de destaque forte aplicada com moderação sobre uma base profissional.
- estilo-livre: traduza a descrição do usuário em atributos visuais concretos (ex: "parece luxo" → paleta dourada/escura, acabamento premium; "colorido/alegre" → paleta vibrante sofisticada, não neon; "simples/direto" → minimalista, bastante espaço em branco; "mais impacto" → alto contraste, tipografia ousada, ainda assim limpa).

## Comparação de qualidade
O nível de produção do prompt final deve mirar algo comparável a uma arte publicitária criada manualmente por um designer, com acabamento visual de campanha de perfumaria, catálogo premium, social media profissional ou anúncio editorial — nunca um resultado que pareça gerado rapidamente por IA ou montado em template básico.

Inclua restrições negativas explícitas ao final do raciocínio (incorporadas na descrição, não como lista à parte): sem aparência de template pronto, sem estética de panfleto barato, sem layout previsível, sem texto gigante genérico, sem contorno preto grosso, sem sombra pesada/exagerada, sem efeito 3D nas letras, sem amarelo neon, sem fundo vermelho saturado genérico, sem excesso de informação/texto, sem rodapé pesado, sem produto colado artificialmente no fundo, sem render 3D, sem textura plástica, sem composição amadora ou poluída, sem logo gigante, sem logo sempre obrigatoriamente no rodapé, sem assinatura desalinhada, sem logo competindo com headline/produto/preço, sem texto quebrado, sem letras ilegíveis, sem palavras separadas incorretamente, sem produto deformado, sem logo inventada, sem marca d'água, sem elementos aleatórios, sem fundo branco genérico quando não solicitado, sem distorções, sem brilho plástico, sem aparência de IA.

## Variações obrigatoriamente diferentes
Gere sempre 2 direções criativas realmente distintas para a mesma peça — nunca a mesma arte com cor trocada:
- Variação 1: mais editorial/premium — composição mais assimétrica, mais espaço negativo, tratamento mais sofisticado e conceitual, preço presente mas discreto.
- Variação 2: mais comercial/vendedora, ainda profissional (nunca panfleto) — composição um pouco mais direta, preço um pouco mais evidente/destacado, energia de venda mais explícita, mas com o mesmo cuidado de direção de arte, tipografia limpa e paleta profissional.
As duas variações podem diferir em ângulo, enquadramento, posição do produto, tratamento de luz e posicionamento da logo — mas ambas devem seguir TODAS as regras acima (nunca aparência de panfleto/template em nenhuma das duas).

## Formato de saída — APENAS JSON, sem markdown, sem texto fora do JSON:
{"variacoes": ["prompt completo da variação 1, em um parágrafo corrido, sem títulos, sem aspas internas, sem explicações", "prompt completo da variação 2, mesmas regras"]}`;

export interface PromptGerado {
  prompt: string;
  usouFallback: boolean;
}

export interface PromptsGerados {
  prompts: string[];
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

function nivelProducaoParaTexto(b: BriefingCompleto): string {
  const nivel = b.nivelProducaoVisual ?? "premium-editorial";
  return `${NIVEIS_PRODUCAO_VISUAL[nivel].label} — ${NIVEIS_PRODUCAO_VISUAL[nivel].hint}`;
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
    `Nível de produção: ${nivelProducaoParaTexto(b)}`,
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

  const d = b.direcaoArte;
  if (d && Object.values(d).some((v) => (Array.isArray(v) ? v.length : v))) {
    linhas.push("Direção de arte já definida com o lojista (use como base, complete o que faltar):");
    if (d.conceitoVisual) linhas.push(`- Conceito visual: ${d.conceitoVisual}`);
    if (d.atmosfera) linhas.push(`- Atmosfera/clima: ${d.atmosfera}`);
    if (d.composicao) linhas.push(`- Composição: ${d.composicao}`);
    if (d.tratamentoLuz) linhas.push(`- Tratamento de luz: ${d.tratamentoLuz}`);
    if (d.paleta) linhas.push(`- Paleta: ${d.paleta}`);
    if (d.tipografia) linhas.push(`- Tipografia: ${d.tipografia}`);
    if (d.texturas) linhas.push(`- Texturas: ${d.texturas}`);
    if (d.hierarquia) linhas.push(`- Hierarquia: ${d.hierarquia}`);
    if (d.posicionamentoLogo) linhas.push(`- Posicionamento da logo: ${d.posicionamentoLogo}`);
    if (d.restricoesEsteticas?.length) linhas.push(`- Restrições estéticas pedidas: ${d.restricoesEsteticas.join("; ")}`);
  }

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
    if (c.assinaturaMarca) linhas.push(`- Assinatura da marca (pequena, posição a definir por direção de arte): ${c.assinaturaMarca}`);
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
// `variante` diferencia levemente as duas imagens geradas (ver montarPrompt).
export function montarPromptFallback(b: BriefingCompleto, variante: 1 | 2 = 1): string {
  const fmt = FORMATOS[b.formato];
  const estiloHint =
    b.estiloVisual === "estilo-livre"
      ? (b.estiloLivre ?? "estilo comercial neutro e elegante")
      : b.estiloVisual
        ? ESTILOS[b.estiloVisual].hint
        : "estilo comercial neutro e elegante";
  const nivel = NIVEIS_VISUAIS[b.nivelVisual ?? "profissional-equilibrado"].hint;
  const producao = NIVEIS_PRODUCAO_VISUAL[b.nivelProducaoVisual ?? "premium-editorial"].hint;
  const enfoqueVariante =
    variante === 1
      ? "composição mais editorial, assimétrica e com bastante espaço negativo, preço presente porém discreto"
      : "composição mais comercial e direta, ainda profissional, com o preço um pouco mais evidente";
  const c = b.conteudoAnuncio;
  const partes: string[] = [
    `Crie uma arte publicitária ${fmt.aspecto} profissional e realista para ${TIPOS_PECA[b.tipoPeca]?.label.toLowerCase() ?? "anúncio"} do produto "${b.nomeProduto}"${b.descricaoProduto ? ` (${b.descricaoProduto})` : ""},`,
    `${estiloHint}, ${nivel}, com produção visual no nível "${producao}", e ${enfoqueVariante},`,
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
  partes.push(`Composição pronta para ${fmt.descricao}, fugindo de layout de template óbvio, com no máximo 3 blocos de texto principais, sem estética de panfleto barato, sem fundo vermelho/laranja saturado genérico, sem amarelo neon e sem excesso de texto.`);
  return partes.join(" ");
}

function montarPromptsFallback(b: BriefingCompleto): string[] {
  return [montarPromptFallback(b, 1), montarPromptFallback(b, 2)];
}

// Gera 2 prompts com direções criativas distintas (ver seção "Variações
// obrigatoriamente diferentes" no SYSTEM) — nunca a mesma arte duas vezes.
export async function montarPrompt(b: BriefingCompleto): Promise<PromptsGerados> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { prompts: montarPromptsFallback(b), usouFallback: true };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: briefingParaTexto(b) },
      ],
    });
    const texto = completion.choices[0]?.message?.content;
    if (!texto) return { prompts: montarPromptsFallback(b), usouFallback: true };
    const j = JSON.parse(texto);
    const prompts = Array.isArray(j.variacoes)
      ? j.variacoes.filter((p: unknown): p is string => typeof p === "string" && p.trim().length > 0)
      : [];
    if (prompts.length === 0) return { prompts: montarPromptsFallback(b), usouFallback: true };
    return { prompts, usouFallback: false };
  } catch (e) {
    console.error("[prompt-builder] OpenAI falhou, usando fallback:", e);
    return { prompts: montarPromptsFallback(b), usouFallback: true };
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
