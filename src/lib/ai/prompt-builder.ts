import OpenAI from "openai";
import { criarCompletionComRetry } from "./completions";
import { TEXT_PROMPT_BUILDER_MODEL, TEXT_ROUTER_MODEL } from "./models";
import {
  ESTILOS,
  FORMATOS,
  NIVEIS_PRODUCAO_VISUAL,
  NIVEIS_VISUAIS,
  TIPOS_PECA,
  type ArteExistenteRequest,
  type BriefingCompleto,
} from "@/lib/types";

// A "IA de conversa" transforma o briefing coletado pelo agente
// conversacional (src/lib/ai/agente-conversa.ts) num prompt visual
// estruturado em português, pronto para o Gemini. O usuário NUNCA escreve
// prompt manualmente — só responde perguntas na conversa guiada.

const SYSTEM = `Você é diretor de arte sênior de publicidade, especializado em campanhas de produto para pequenos lojistas brasileiros. Você não cria apenas "uma arte organizada" — você cria uma peça publicitária com direção de arte profissional completa, no nível de uma produção real de agência, não de um gerador automático.

Antes de escrever o prompt final, interprete o briefing e defina uma linguagem visual coerente: conceito visual, clima/atmosfera da peça, estilo de fotografia, hierarquia editorial, linguagem tipográfica, composição, tratamento de luz, textura, profundidade, posição estratégica de cada elemento, nível de sofisticação e referência estética do segmento do produto. O resultado deve parecer criado por um designer publicitário experiente, com domínio de composição, tipografia, fotografia, luz, textura e hierarquia visual — comparável a uma campanha de perfumaria, catálogo premium, social media profissional ou peça editorial, nunca a algo montado rapidamente em um template.

O produto deve ser tratado como protagonista visual absoluto da peça — mais do que qualquer texto. Nunca invente outro produto nem altere a marca. Se não houver foto, componha o produto do zero a partir da descrição, com o máximo de coerência e realismo possível. O texto deve complementar a venda, nunca dominar a arte.

## Foto de produto enviada — referência do produto, NÃO composição final (regra crítica)
Quando o briefing indicar que há uma foto real do produto anexada, trate essa imagem como REFERÊNCIA VISUAL do produto, nunca como o layout final da peça. Use a foto só para entender as características reais do produto: formato, cor, material, proporção, tampa/rótulo/detalhes, textura, identidade visual e ângulo aproximado (quando útil). Muitas dessas fotos são casuais — tiradas rapidamente no trabalho, em casa ou num ambiente improvisado — e o prompt final NUNCA deve preservar esse contexto amador: remova mentalmente a mesa, o ambiente de trabalho, o fundo bagunçado, a luz fraca, sombras feias, ruído, objetos secundários e o enquadramento casual da foto original, a menos que o lojista peça explicitamente para manter o ambiente. Recrie o produto como um hero shot publicitário profissional: cena de estúdio coerente com a direção de arte da peça, iluminação direcional profissional, sombra realista, reflexos naturais sutis, integração natural com o cenário — nunca a aparência de "foto colada" ou recortada artificialmente sobre um fundo/template. O produto deve ter recorte limpo, textura preservada, proporção e volume realistas, nitidez e aparência comercial; nunca bordas estranhas, luz destoante do cenário, textura plástica falsa, deformação ou um resultado genérico a ponto de perder a identidade real do produto.

## Fundo "clean" — minimalista profissional, nunca vazio
Quando o lojista pedir fundo "mais clean" ou similar, isso NÃO significa fundo vazio, chapado, sem profundidade ou sem acabamento. Um fundo clean profissional ainda tem: gradiente sutil, luz controlada, sombra natural do produto, textura mínima mas presente, profundidade suave (nunca uma cor lisa morta), paleta coerente com o produto, área de respiro generosa e acabamento de campanha comercial. "Clean" é uma direção de arte (minimalismo intencional), não ausência de direção de arte.

## Relação entre produto, fundo e texto
Antes de escrever o prompt final, defina explicitamente a relação entre produto, fundo e texto: o produto é sempre o protagonista; o fundo existe para valorizar o produto (nunca compete com ele, nunca é só preenchimento); os textos seguem hierarquia de marketing (headline > oferta/preço > benefício/CTA > assinatura). Nunca projete um layout onde o produto pareça separado ou "colado" na peça — produto, fundo e texto devem parecer desenhados juntos, como uma única composição.
Quando houver produto real (foto anexada): o produto ocupa a área de maior peso visual; a headline usa uma área de respiro que não compete com o produto; o preço/oferta aparece em bloco ou selo bem integrado ao layout (nunca solto ou por cima do produto); benefícios ficam menores e secundários; a logo fica onde equilibrar melhor a composição; evite excesso de elementos e nunca deixe texto cobrindo o produto.

## Textos dentro da imagem — poucos blocos, curtos e exatos
Como ainda não existe sistema de overlay no app, os textos são gerados dentro da própria imagem pelo modelo — por isso o prompt final deve reduzir a quantidade de texto sempre que possível. Priorize nesta ordem: (1) headline curta, (2) preço/oferta, (3) um benefício ou CTA essencial, (4) logo/assinatura da marca. Evite frases longas, textos redundantes ou muitos blocos textuais. Preserve exatamente, sem alterar uma letra ou número, todos os preços, telefones, nomes de marca e nomes de produto fornecidos pelo lojista.

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

Quando houver foto de produto anexada, inclua também estas restrições: sem aparência de foto amadora colada sobre o fundo, sem preservar mesa ou ambiente de trabalho, sem fundo de escritório ou mesa bagunçada, sem luz ruim ou casual da foto original, sem produto recortado artificialmente com bordas estranhas, sem produto com textura plástica falsa, sem layout de template genérico com o produto por cima, sem fundo chapado/morto sem direção de arte quando o pedido for "clean".

## Uma única direção criativa, bem equilibrada
Gere UMA peça só, mas pensada com cuidado: equilibre sofisticação editorial (composição elegante, espaço negativo, tratamento conceitual) com clareza comercial (produto e oferta legíveis rapidamente, preço bem visível). Não é pra escolher um extremo — é pra acertar o meio-termo profissional que vende sem parecer panfleto.

## Formato de saída — APENAS JSON, sem markdown, sem texto fora do JSON:
{"variacoes": ["prompt completo da peça final, em um parágrafo corrido, sem títulos, sem aspas internas, sem explicações"]}`;

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
      ? "Há uma foto real do produto anexada — use-a apenas como referência do produto (formato, cor, material, proporção, rótulo, tampa e detalhes reais), NUNCA como composição final. Se a foto for casual (mesa, ambiente de trabalho, luz fraca, bagunça), remova esse contexto amador e recrie o produto como hero shot publicitário profissional, a menos que o lojista peça explicitamente para preservar o ambiente original."
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
export function montarPromptFallback(b: BriefingCompleto): string {
  const fmt = FORMATOS[b.formato];
  const estiloHint =
    b.estiloVisual === "estilo-livre"
      ? (b.estiloLivre ?? "estilo comercial neutro e elegante")
      : b.estiloVisual
        ? ESTILOS[b.estiloVisual].hint
        : "estilo comercial neutro e elegante";
  const nivel = NIVEIS_VISUAIS[b.nivelVisual ?? "profissional-equilibrado"].hint;
  const producao = NIVEIS_PRODUCAO_VISUAL[b.nivelProducaoVisual ?? "premium-editorial"].hint;
  const c = b.conteudoAnuncio;
  const partes: string[] = [
    `Crie uma arte publicitária ${fmt.aspecto} profissional e realista para ${TIPOS_PECA[b.tipoPeca]?.label.toLowerCase() ?? "anúncio"} do produto "${b.nomeProduto}"${b.descricaoProduto ? ` (${b.descricaoProduto})` : ""},`,
    `${estiloHint}, ${nivel}, com produção visual no nível "${producao}", equilibrando sofisticação editorial com clareza comercial,`,
    b.temFotoProduto
      ? "use a foto anexada apenas como referência do produto (formato, cor, material, proporção e detalhes reais) — remova o ambiente casual da foto original (mesa, fundo bagunçado, luz fraca) e recrie o produto como hero shot publicitário profissional, iluminação de estúdio, sombra realista, acabamento premium e comercial, sem aparência de foto colada ou de imagem gerada por IA."
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
  return [montarPromptFallback(b)];
}

// Gera 1 prompt final, equilibrando direção editorial e clareza comercial
// (ver seção "Uma única direção criativa" no SYSTEM). Só 1 variação por
// geração — mantém a geração de imagem dentro do tempo de resposta da
// function (gpt-image-2 é mais lento que o Gemini usado antes).
export async function montarPrompt(b: BriefingCompleto): Promise<PromptsGerados> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { prompts: montarPromptsFallback(b), usouFallback: true };
  }

  try {
    // Timeout explícito (o padrão do SDK é 10min) — sem isso, uma chamada
    // lenta pode travar bem além do maxDuration da function serverless, que
    // aí mata o processo e devolve uma página de erro (não-JSON) pro
    // cliente. Falhar rápido aqui é o que permite cair no fallback a tempo.
    const openai = new OpenAI({ apiKey, timeout: 25_000 });
    const completion = await openai.chat.completions.create({
      model: TEXT_PROMPT_BUILDER_MODEL,
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

// Prompt de edição destinado ao FAL Flux Kontext — em INGLÊS (o modelo segue
// instruções em inglês com muito mais fidelidade; em português ele às vezes
// recriava a arte inteira, mudava textos/logo ou inventava palavras). Texto
// que deve aparecer na arte fica entre aspas, sempre no idioma original do
// usuário (nunca traduzido) — só a INSTRUÇÃO de edição em si é em inglês.
function fallbackAjusteCirurgico(pedidoUsuario: string): string {
  return `Make a precise local edit only. Apply exactly this change: "${pedidoUsuario}". Any text that must appear in the image must stay exactly as written above, in its original language — do not translate, rewrite, or correct it. Preserve the original artwork exactly, including composition, product, background, lighting, color palette, existing text, price, phone number, address, typography, logo, logo colors, logo proportions, logo position and brand identity, unless explicitly requested otherwise. Do not redraw the artwork and do not change any element that was not explicitly requested.`;
}

// Reinterpreta um pedido de ajuste em linguagem natural sobre uma arte já
// gerada, combinando com o prompt anterior para gerar um novo prompt de
// edição CIRÚRGICA em INGLÊS pro Flux Kontext: só o elemento pedido muda,
// tudo o mais (incluindo logo e cores da marca) é preservado explicitamente
// — "mantenha o resto igual" de forma genérica não é suficiente, o modelo
// de imagem precisa da lista explícita do que proteger.
export async function montarPromptAjuste(
  promptAnterior: string,
  pedidoUsuario: string,
): Promise<PromptGerado> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = fallbackAjusteCirurgico(pedidoUsuario);
  if (!apiKey) return { prompt: fallback, usouFallback: true };

  // Timeout curto por tentativa: com 1 retry (ver completions.ts), o pior
  // caso fica bem limitado — importante aqui porque /api/adjust já gasta a
  // maior parte do seu orçamento de tempo na geração da imagem em si.
  const openai = new OpenAI({ apiKey, timeout: 15_000 });
  let texto: string | null | undefined;
  try {
    const completion = await criarCompletionComRetry(openai, {
      model: TEXT_ROUTER_MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `You write precise image editing instructions for Flux Kontext, an image-to-image editing model. The user (a Brazilian shopkeeper) writes in Portuguese, but your editing instructions must be written in English, because the image model follows English instructions more reliably.

You will receive the ORIGINAL image prompt (in Portuguese, describing what already exists in the artwork) and the user's adjustment request (in Portuguese). Use the original prompt only as context, translated into English, to describe what already exists in the artwork — you are not regenerating it.

Your task is to create a surgical edit prompt. Change only what the user explicitly asked for. Do not redesign, reinterpret, improve, or recreate the artwork.

Any text that must appear in the image must remain exactly in the original language and spelling the user provided, inside quotation marks (for example: add the text exactly as written: "BRASIL x NORUEGA"). Do not translate, rewrite, correct, summarize, or modify text that appears in the artwork, existing or new.

Always preserve the original artwork exactly, including composition, background, lighting, colors, typography, product, logo, logo colors, logo proportions, logo position, brand identity, price, phone number, address, and all existing text, unless the user explicitly requested changing one of those elements.

When adding a new element, specify exact position, scale, and visual priority using concrete words: small, discreet, secondary, aligned, below, above, left, right, centered, corner.

Avoid vague creative language such as "abstract", "sophisticated elements", "adapt the composition", "integrate into the universe", or "redesign". Prefer concrete editing instructions.

Return only the final edit prompt in English (with any visual text kept in its original language inside quotes). No explanations, no surrounding quotes around the whole output.`,
        },
        {
          role: "user",
          content: `PROMPT ANTERIOR:\n${promptAnterior}\n\nPEDIDO DE AJUSTE:\n${pedidoUsuario}`,
        },
      ],
    });
    texto = completion.choices[0]?.message?.content?.trim();
  } catch (e) {
    console.error("[prompt-builder] ajuste OpenAI falhou, usando fallback:", e);
    return { prompt: fallback, usouFallback: true };
  }
  if (!texto) return { prompt: fallback, usouFallback: true };
  return { prompt: texto, usouFallback: false };
}

// Fluxo de edição direta (/editar): o lojista sobe um design PRONTO (feito
// fora do app, sem briefing/prompt anterior nosso) e pede uma mudança em
// linguagem natural. Diferente de montarPromptAjuste, aqui não existe
// "prompt anterior" — só a imagem em si e o pedido. Mesma exigência de
// edição cirúrgica em INGLÊS pro Flux Kontext: preservar produto, textos,
// contato e identidade visual (incluindo logo) por padrão.
export async function montarPromptEdicaoDireta(pedidoUsuario: string): Promise<PromptGerado> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = fallbackAjusteCirurgico(pedidoUsuario);
  if (!apiKey) return { prompt: fallback, usouFallback: true };

  const openai = new OpenAI({ apiKey, timeout: 15_000 });
  let texto: string | null | undefined;
  try {
    const completion = await criarCompletionComRetry(openai, {
      model: TEXT_ROUTER_MODEL,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: `You write precise image editing instructions for Flux Kontext, an image-to-image editing model. A shopkeeper uploaded a ready-made design (made outside this app) and wrote a change request in Portuguese. Your editing instructions must be written in English, because the image model follows English instructions more reliably.

Your task is to create a surgical edit prompt. Apply exactly the change requested. Do not redesign, reinterpret, improve, or recreate the artwork.

Any text that must appear in the image must remain exactly in the original language and spelling the user provided, inside quotation marks. Do not translate, rewrite, correct, summarize, or modify text that appears in the artwork, existing or new.

The edit must be surgical:
- change only the requested element;
- preserve the original composition;
- preserve the product;
- preserve all text that was not mentioned;
- preserve price, phone number, address and CTA;
- preserve the logo, logo colors, logo shape, logo proportions, logo position and logo legibility;
- preserve typography, colors, lighting, background, style and brand identity, unless the user explicitly asked to change one of those.

Do not redraw the whole artwork. Do not recreate the layout. Do not change the brand identity. Do not change the logo color as a side effect of background, contrast, light or palette adjustments.

When adding a new element, specify exact position, scale and visual priority using concrete words: small, discreet, secondary, aligned, below, above, left, right, centered, corner.

Return only the final edit prompt in English (with any visual text kept in its original language inside quotes). No explanations.`,
        },
        { role: "user", content: `PEDIDO DE EDIÇÃO:\n${pedidoUsuario}` },
      ],
    });
    texto = completion.choices[0]?.message?.content?.trim();
  } catch (e) {
    console.error("[prompt-builder] edição direta OpenAI falhou, usando fallback:", e);
    return { prompt: fallback, usouFallback: true };
  }
  if (!texto) return { prompt: fallback, usouFallback: true };
  return { prompt: texto, usouFallback: false };
}

// Fallback determinístico em português pro caminho gpt-image-2 (usado só
// quando ENABLE_FLUX_EDIT=false, ver models.ts) — gpt-image-2 segue
// instrução em português com fidelidade alta, incluindo texto renderizado
// corretamente (testado ao vivo, sem os erros de digitação que o Flux
// Kontext às vezes introduz em textos não relacionados ao pedido).
function fallbackAjusteCirurgicoPortugues(pedidoUsuario: string): string {
  return `Aplique somente esta alteração: ${pedidoUsuario}. Preserve exatamente todo o restante da arte original, incluindo composição geral, enquadramento, proporção da arte, produto, formato do produto, cor do produto, textura do produto, fundo, iluminação, sombras, reflexos, paleta de cores, estilo visual aprovado, tipografia, hierarquia visual, todos os textos existentes, preço, telefone/WhatsApp, endereço, CTA, nome da marca, logo, cores da logo, formato da logo, proporção da logo, posição da logo, nitidez da logo e identidade visual da marca, a menos que o pedido tenha citado explicitamente um desses elementos. Não recrie a arte inteira e não mude nenhum elemento que não tenha sido pedido.`;
}

// Variante de montarPromptAjuste em PORTUGUÊS, para quando o provider de
// ajuste é gpt-image-2 em vez do Flux Kontext (ver ENABLE_FLUX_EDIT em
// models.ts). Mesma exigência de edição cirúrgica — só muda o idioma de
// saída, porque gpt-image-2 não tem o mesmo ganho de fidelidade com inglês
// que o Flux Kontext tem.
export async function montarPromptAjusteGptImage(
  promptAnterior: string,
  pedidoUsuario: string,
): Promise<PromptGerado> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = fallbackAjusteCirurgicoPortugues(pedidoUsuario);
  if (!apiKey) return { prompt: fallback, usouFallback: true };

  const openai = new OpenAI({ apiKey, timeout: 15_000 });
  let texto: string | null | undefined;
  try {
    const completion = await criarCompletionComRetry(openai, {
      model: TEXT_ROUTER_MODEL,
      temperature: 0.4,
      messages: [
        {
          role: "system",
          content: `Você escreve instruções de edição de imagem para uma arte publicitária já gerada, usando GPT Image. Sua função é transformar o pedido simples do usuário em um prompt de ajuste claro, fiel e seguro. Você recebe o prompt anterior (contexto do que já existe na arte) e o pedido de ajuste do lojista, ambos em português.

A edição deve ser cirúrgica. Altere somente o que o usuário pediu explicitamente. Não recrie a arte inteira. Não reinterprete o briefing. Não melhore por conta própria. Não mude conceito, estilo, fundo, produto, textos, cores, logo, composição ou identidade visual se isso não tiver sido pedido.

A imagem original deve ser tratada como a referência principal. O objetivo é preservar a arte existente e aplicar apenas o ajuste solicitado.

Regra principal:
Aplique somente a alteração solicitada pelo usuário e preserve exatamente todo o restante da arte original.

Elementos protegidos por padrão:
- composição geral;
- enquadramento;
- proporção da arte;
- produto;
- formato do produto;
- cor do produto;
- textura do produto;
- fundo;
- iluminação;
- sombras;
- reflexos;
- paleta de cores;
- estilo visual aprovado;
- tipografia;
- hierarquia visual;
- todos os textos existentes;
- preço;
- telefone/WhatsApp;
- endereço;
- CTA;
- nome da marca;
- logo;
- cores da logo;
- formato da logo;
- proporção da logo;
- posição da logo;
- nitidez da logo;
- identidade visual da marca.

A logo é um elemento protegido. Nunca altere cor, forma, fonte, proporção, nitidez, posição ou estilo da logo, a menos que o usuário peça explicitamente uma alteração na logo.

Se o usuário pedir um ajuste na logo:
- se pedir para diminuir a logo, altere somente o tamanho; preserve cor, formato, proporção, posição relativa, nitidez e estilo;
- se pedir para mover a logo, altere somente a posição; preserve cor, tamanho, formato, proporção, nitidez e estilo;
- se pedir para trocar a cor da logo, altere somente a cor; preserve tamanho, posição, formato, proporção, nitidez e estilo.

Regra para textos:
Preserve literalmente todos os textos existentes que não foram citados pelo usuário. Não corrija, não reescreva, não traduza, não resuma e não substitua textos que o usuário não pediu para mudar. Quando o usuário pedir para alterar um texto, altere somente aquele texto. Preserve todos os outros textos, números, preços, telefones, endereços, CTAs e nomes exatamente como estão. Qualquer texto novo que precise aparecer na imagem deve ser mantido exatamente como fornecido pelo usuário, entre aspas. Não traduza, não corrija e não modifique o texto visual.

Regra para fundo, luz e paleta:
Se o usuário pedir para mudar fundo, iluminação, contraste, cor geral ou atmosfera, deixe explícito que produto, textos, logo, cores da logo e identidade visual devem permanecer inalterados.

Regra para produto:
Se o usuário pedir ajuste no produto, altere somente o aspecto solicitado. Preserve proporção, cor, formato, material e características reais do produto, salvo se o usuário pedir explicitamente o contrário.

Regra para adição de elementos:
Se o usuário pedir para adicionar um elemento, adicione somente esse elemento. Defina posição, escala e prioridade visual. O novo elemento deve entrar de forma integrada, sem reorganizar a arte inteira e sem competir com produto, headline, preço ou logo. Use tamanho proporcional, mantenha a hierarquia visual original, respeite o espaço negativo existente, não cubra produto, preço, logo ou textos importantes, não crie textos além dos solicitados e não altere elementos já existentes.

Regra para bandeiras, ícones e selos:
Se o usuário pedir bandeiras, ícones ou selos, eles devem ser pequenos, proporcionais, limpos e secundários, salvo se o usuário pedir destaque. Não transforme bandeiras, ícones ou selos em protagonistas da arte sem pedido explícito.

Regra para ajustes de design (ex: "deixa mais clean", "mais premium", "mais elegante", "menos chamativo", "mais profissional"):
Ajuste apenas os elementos necessários para alcançar esse refinamento, preservando a estrutura da arte. Não mude o conceito inteiro. Não troque a paleta inteira sem necessidade. Não apague textos, logo ou produto. Ajustes de estilo devem ser sutis e controlados: melhorar equilíbrio, reduzir exageros, refinar sombras, suavizar efeitos, melhorar contraste, limpar poluição visual, manter identidade visual. Não transforme um ajuste de estilo em uma nova criação.

Formato ideal do prompt de ajuste:
"Aplique somente esta alteração: [descrição específica do ajuste]. Preserve exatamente todo o restante da arte original, incluindo [lista dos elementos protegidos relevantes]. Não altere [elementos que costumam ser afetados indevidamente]."

O prompt final deve ser claro, direto e completo. Não precisa ser limitado a duas frases. A prioridade é fidelidade ao pedido e preservação da arte original.

Instruções finais:
- Retorne apenas o prompt final de ajuste.
- Não explique o raciocínio.
- Não use aspas envolvendo o prompt inteiro.
- Não adicione comentários.
- Não gere alternativas.
- Não mencione modelo de IA.
- Não diga que está preservando por segurança; apenas escreva o prompt de edição.
- Seja específico, fiel ao pedido e conservador com todo o restante da arte.`,
        },
        {
          role: "user",
          content: `PROMPT ANTERIOR:\n${promptAnterior}\n\nPEDIDO DE AJUSTE:\n${pedidoUsuario}`,
        },
      ],
    });
    texto = completion.choices[0]?.message?.content?.trim();
  } catch (e) {
    console.error("[prompt-builder] ajuste gpt-image-2 falhou, usando fallback:", e);
    return { prompt: fallback, usouFallback: true };
  }
  if (!texto) return { prompt: fallback, usouFallback: true };
  return { prompt: texto, usouFallback: false };
}

// Variante de montarPromptEdicaoDireta em PORTUGUÊS, para o mesmo caso de
// ENABLE_FLUX_EDIT=false — usada pelo fluxo /editar (design pronto enviado
// pelo lojista, sem prompt anterior nosso).
export async function montarPromptEdicaoDiretaGptImage(pedidoUsuario: string): Promise<PromptGerado> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = fallbackAjusteCirurgicoPortugues(pedidoUsuario);
  if (!apiKey) return { prompt: fallback, usouFallback: true };

  const openai = new OpenAI({ apiKey, timeout: 15_000 });
  let texto: string | null | undefined;
  try {
    const completion = await criarCompletionComRetry(openai, {
      model: TEXT_ROUTER_MODEL,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: `Você escreve instruções de edição de imagem em português para o gpt-image-2. O lojista enviou um design pronto, feito fora do app, e pediu uma mudança em linguagem simples. Sua função é transformar esse pedido em um prompt de ajuste claro, fiel e seguro.

A edição deve ser cirúrgica. Altere somente o que foi pedido explicitamente. Não recrie a arte inteira. Não reinterprete o design. Não melhore por conta própria. A imagem original é a referência principal — preserve-a, aplicando apenas o ajuste solicitado.

Elementos protegidos por padrão: composição geral, enquadramento, proporção da arte, produto, formato do produto, cor do produto, textura do produto, fundo, iluminação, sombras, reflexos, paleta de cores, estilo visual, tipografia, hierarquia visual, todos os textos existentes, preço, telefone/WhatsApp, endereço, CTA, nome da marca, logo, cores da logo, formato da logo, proporção da logo, posição da logo, nitidez da logo e identidade visual da marca.

A logo é protegida por padrão: nunca altere cor, forma, fonte, proporção, nitidez, posição ou estilo da logo a menos que o usuário peça explicitamente. Se pedir ajuste na logo, altere somente o aspecto citado (tamanho, posição ou cor) e preserve todo o resto dela.

Preserve literalmente todos os textos existentes que não foram citados — nunca corrija, reescreva, traduza ou substitua. Qualquer texto novo deve ser mantido exatamente como o usuário forneceu, entre aspas.

Se o pedido for adicionar um elemento (texto, bandeira, ícone, selo), defina posição, escala e prioridade visual: pequeno, proporcional, integrado, sem cobrir produto/preço/logo/textos importantes e sem competir com a headline.

Se o pedido for de refinamento de estilo ("mais clean", "mais premium", "mais elegante"), ajuste só o necessário para esse refinamento — não troque o conceito, a paleta inteira, nem apague texto, logo ou produto.

Formato ideal: "Aplique somente esta alteração: [ajuste específico]. Preserve exatamente todo o restante do design original, incluindo [elementos protegidos relevantes]. Não altere [elementos que costumam ser afetados indevidamente]."

Retorne apenas o prompt final de ajuste, sem aspas ao redor de tudo, sem explicações, sem comentários e sem mencionar modelo de IA.`,
        },
        { role: "user", content: `PEDIDO DE EDIÇÃO:\n${pedidoUsuario}` },
      ],
    });
    texto = completion.choices[0]?.message?.content?.trim();
  } catch (e) {
    console.error("[prompt-builder] edição direta gpt-image-2 falhou, usando fallback:", e);
    return { prompt: fallback, usouFallback: true };
  }
  if (!texto) return { prompt: fallback, usouFallback: true };
  return { prompt: texto, usouFallback: false };
}

export type TipoPedidoAjuste = "ajuste" | "nova-criacao" | "ambiguo";

export interface ClassificacaoAjuste {
  tipo: TipoPedidoAjuste;
  resumo: string; // frase curta descrevendo o que vai mudar, para confirmação
  elementosAlvo: string[]; // o que o usuário realmente pediu para mudar
  elementosProtegidos: string[]; // tudo que deve permanecer igual
  riscoDeAlterarMarca: boolean; // pedido envolve logo, cores da marca ou identidade visual
  precisaConfirmacao: boolean; // ambíguo ou com risco de mexer na marca sem pedido explícito
  // Pedidos de texto exato/preço/contato/bandeira/ícone/logo tendem a ficar
  // mais precisos com um overlay do app (HTML/CSS/SVG) do que com edição
  // generativa, que pode reinterpretar ou distorcer esses elementos. Por
  // enquanto é só um sinal — não existe overlay implementado ainda.
  sugerirOverlay: boolean;
}

// Elementos sempre protegidos por padrão numa classificação — a logo entra
// aqui mesmo sem o lojista mencionar, porque ela nunca deve mudar "de
// carona" num ajuste de outra coisa.
const ELEMENTOS_PROTEGIDOS_BASE = ["logo", "cores da logo", "proporção da logo", "posição da logo", "produto", "textos existentes", "preço", "contato"];
const PALAVRAS_RISCO_MARCA = /\b(logo|logotipo|marca|identidade visual|paleta)\b/i;
const PALAVRAS_NOVA_CRIACAO = /\b(refaz|refazer|refeito|n[aã]o gostei|cria outra|completamente diferente|come[cç]a de novo|do zero)\b/i;
// Texto exato, preço, contato, bandeiras/ícones e logo são elementos onde um
// overlay do app (HTML/CSS/SVG) tende a ser mais preciso que edição
// generativa — que pode reinterpretar, redesenhar ou distorcer esse tipo de
// elemento em vez de só posicioná-lo.
const PALAVRAS_OVERLAY =
  /\b(texto|frase|palavra|escrit[ao]|pre[cç]o|telefone|whatsapp|endere[cç]o|contato|bandeira|[ií]cone|logo|logotipo)\b/i;

// Decide se um pedido em linguagem natural sobre uma arte já gerada é um
// AJUSTE pontual (chamar /api/adjust) ou parece uma NOVA CRIAÇÃO disfarçada
// (o lojista deveria recomeçar o briefing). Roda antes de gastar 1 crédito.
export async function classificarPedidoAjuste(pedido: string): Promise<ClassificacaoAjuste> {
  const apiKey = process.env.OPENAI_API_KEY;
  // Fallback heurístico simples caso a IA não esteja configurada/disponível.
  if (!apiKey) {
    const riscoDeAlterarMarca = PALAVRAS_RISCO_MARCA.test(pedido);
    return {
      tipo: PALAVRAS_NOVA_CRIACAO.test(pedido) ? "nova-criacao" : "ajuste",
      resumo: pedido,
      elementosAlvo: [pedido],
      elementosProtegidos: ELEMENTOS_PROTEGIDOS_BASE,
      riscoDeAlterarMarca,
      precisaConfirmacao: riscoDeAlterarMarca,
      sugerirOverlay: PALAVRAS_OVERLAY.test(pedido),
    };
  }

  const openai = new OpenAI({ apiKey, timeout: 15_000 });
  let texto: string | null | undefined;
  try {
    const completion = await criarCompletionComRetry(openai, {
      model: TEXT_ROUTER_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você classifica pedidos de alteração feitos sobre uma arte publicitária já gerada. Sua função é decidir se o pedido é um ajuste pontual, uma nova criação disfarçada ou ambíguo. Responda somente em JSON válido.

Use:
- ajuste: quando o usuário pedir mudança pequena e específica, como trocar preço, mudar cor de fundo, aumentar texto, remover um elemento, diminuir logo ou ajustar posição.
- nova-criacao: quando o usuário quiser recomeçar, mudar o conceito inteiro, trocar produto principal, mudar formato e estilo ao mesmo tempo, ou disser que não gostou e quer outra arte.
- ambiguo: quando o pedido não deixar claro qual elemento deve mudar, ou quando puder afetar elementos importantes como logo, cores da marca, produto, textos principais ou composição inteira.

Sempre identifique os elementosAlvo, ou seja, aquilo que o usuário realmente pediu para mudar. Sempre identifique elementosProtegidos, ou seja, tudo que deve permanecer igual. Considere a logo e seus atributos como protegidos por padrão: cor, forma, proporção, posição, legibilidade e estilo. Marque riscoDeAlterarMarca como true quando o pedido envolver logo, cores da marca, identidade visual, paleta geral ou algo que possa afetar a marca. Marque precisaConfirmacao como true quando houver ambiguidade ou risco de alterar a marca sem pedido explícito.

Se o pedido for ambíguo sobre QUAL elemento deve mudar (ex: "troque a cor para vermelho" sem dizer de quê), escreva em "resumo" uma pergunta direta pro lojista escolher o elemento, em vez de supor.

Responda em JSON: {"tipo": "ajuste"|"nova-criacao"|"ambiguo", "resumo": "frase curta e específica, ou a pergunta de esclarecimento quando ambíguo", "elementosAlvo": ["..."], "elementosProtegidos": ["..."], "riscoDeAlterarMarca": true|false, "precisaConfirmacao": true|false}`,
        },
        { role: "user", content: pedido },
      ],
    });
    texto = completion.choices[0]?.message?.content;
  } catch (e) {
    console.error("[prompt-builder] classificação de ajuste falhou:", e);
    return {
      tipo: "ajuste",
      resumo: pedido,
      elementosAlvo: [pedido],
      elementosProtegidos: ELEMENTOS_PROTEGIDOS_BASE,
      riscoDeAlterarMarca: false,
      precisaConfirmacao: false,
      sugerirOverlay: PALAVRAS_OVERLAY.test(pedido),
    };
  }

  const fallbackClassificacao: ClassificacaoAjuste = {
    tipo: "ajuste",
    resumo: pedido,
    elementosAlvo: [pedido],
    elementosProtegidos: ELEMENTOS_PROTEGIDOS_BASE,
    riscoDeAlterarMarca: false,
    precisaConfirmacao: false,
    sugerirOverlay: PALAVRAS_OVERLAY.test(pedido),
  };
  if (!texto) return fallbackClassificacao;
  try {
    const j = JSON.parse(texto);
    const tipo: TipoPedidoAjuste = ["ajuste", "nova-criacao", "ambiguo"].includes(j.tipo) ? j.tipo : "ajuste";
    const resumo = typeof j.resumo === "string" && j.resumo.trim() ? j.resumo.trim() : pedido;
    const elementosAlvo = Array.isArray(j.elementosAlvo)
      ? j.elementosAlvo.filter((x: unknown) => typeof x === "string")
      : [pedido];
    const elementosProtegidos = Array.isArray(j.elementosProtegidos)
      ? j.elementosProtegidos.filter((x: unknown) => typeof x === "string")
      : ELEMENTOS_PROTEGIDOS_BASE;
    const riscoDeAlterarMarca = j.riscoDeAlterarMarca === true;
    const precisaConfirmacao = j.precisaConfirmacao === true || tipo === "ambiguo" || riscoDeAlterarMarca;
    const sugerirOverlay = PALAVRAS_OVERLAY.test(pedido);
    return { tipo, resumo, elementosAlvo, elementosProtegidos, riscoDeAlterarMarca, precisaConfirmacao, sugerirOverlay };
  } catch (e) {
    // Falha de PARSE (conteúdo não é JSON válido) é um erro diferente de
    // falha de API — nunca deixa o texto cru do modelo vazar pro chamador.
    console.error("[prompt-builder] resposta de classificação não é JSON válido:", e, texto);
    return fallbackClassificacao;
  }
}

// ==== Melhorar/variar uma arte existente (fluxo rápido, sem briefing) ====
// Diferente do ajuste cirúrgico (montarPromptAjuste*): aqui a intenção é
// criar uma NOVA versão melhorada da arte enviada, preservando a ideia
// central, produto, marca e informações comerciais — não travar em um único
// elemento pontual. Pedidos claramente pontuais são sinalizados à parte
// (ver pareceAjustePontual) pra sugerir o fluxo de ajuste em vez deste.
const PALAVRAS_AJUSTE_PONTUAL =
  /\b(s[oó]\s+(troca|muda|altera|remove|tira|ajusta|diminui|aumenta|coloca|adiciona)|diminui(r)?\s+a\s+logo|aumenta(r)?\s+a\s+logo|move(r)?\s+a\s+logo|remove(r)?\s+(esse|este|o|a)\s+(texto|selo|elemento)|troca(r)?\s+(o|a)\s+(pre[cç]o|texto|cor|telefone|endere[cç]o|whatsapp))\b/i;

// Heurística leve (não bloqueante) pra avisar o lojista quando o pedido no
// fluxo de "melhorar/nova variação" parece na verdade um ajuste pontual —
// esse fluxo gera uma peça nova a partir da referência, não faz edição
// cirúrgica de um elemento só.
export function pareceAjustePontual(texto: string): boolean {
  return PALAVRAS_AJUSTE_PONTUAL.test(texto);
}

const DESCRICAO_ESTILO_ARTE_EXISTENTE: Record<Exclude<ArteExistenteRequest["estiloDesejado"], undefined>, string> = {
  "mesma_ideia_melhorada": "melhorar mantendo a mesma ideia — versão mais profissional e refinada, sem mudar o conceito",
  "premium": "deixar mais premium — reduzir aparência de panfleto, paleta mais sofisticada, tipografia mais elegante",
  "clean": "deixar mais clean — simplificar composição, reduzir ruído visual, mais espaço negativo",
  "chamativa": "deixar mais chamativa — mais impacto comercial e contraste, sem ficar amador ou poluído",
  "minimalista": "deixar mais minimalista — poucos elementos, bastante respiro, composição limpa",
  "luxo": "aplicar estética de luxo — acabamento sofisticado, paleta e tipografia premium",
  "personalizado": "aplicar o pedido específico descrito pelo lojista abaixo",
};

function descreverPedidoArteExistente(
  req: Pick<ArteExistenteRequest, "intencao" | "estiloDesejado" | "instrucaoUsuario">,
): string {
  const linhas: string[] = [];
  if (req.estiloDesejado) {
    linhas.push(`O lojista escolheu: ${DESCRICAO_ESTILO_ARTE_EXISTENTE[req.estiloDesejado]}.`);
  } else if (req.intencao === "nova_variacao") {
    linhas.push("O lojista quer criar uma nova variação parecida, mantendo a mesma ideia e informações principais, mas com composição/fundo/estilo diferentes.");
  } else {
    linhas.push("O lojista quer melhorar a arte mantendo a mesma ideia.");
  }
  if (req.instrucaoUsuario?.trim()) {
    linhas.push(`Instrução adicional do lojista: ${req.instrucaoUsuario.trim()}`);
  }
  return linhas.join("\n");
}

function fallbackMelhorarArteExistente(req: Pick<ArteExistenteRequest, "instrucaoUsuario">): string {
  const instrucao = req.instrucaoUsuario?.trim();
  return `Use the uploaded artwork as the main visual reference and create a new improved variation of this advertising design. Preserve the main product, brand, logo, key texts, price, contact information, commercial message and overall intent. Do not invent or change commercial information. Improve the design quality with better composition, clearer hierarchy, more professional typography, refined lighting, better spacing, stronger product focus and a more polished advertising look. Keep the same core idea, but make the artwork look more professional, balanced and ready for social media.${instrucao ? ` ${instrucao}.` : ""} Avoid amateur template look, cluttered layout, distorted logo, wrong text, changed price, changed phone number, unreadable typography, excessive effects and generic AI-looking design.`;
}

// Gera o prompt final (em INGLÊS — gpt-image-2 segue esse tipo de instrução
// de direção de arte com mais consistência) pro fluxo de melhorar/variar
// uma arte existente enviada pelo lojista. Diferente do ajuste cirúrgico:
// aqui o objetivo é uma NOVA versão melhor, não uma mudança pontual.
export async function montarPromptMelhorarArteExistente(
  req: Pick<ArteExistenteRequest, "intencao" | "estiloDesejado" | "instrucaoUsuario">,
): Promise<PromptGerado> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = fallbackMelhorarArteExistente(req);
  if (!apiKey) return { prompt: fallback, usouFallback: true };

  const openai = new OpenAI({ apiKey, timeout: 25_000 });
  let texto: string | null | undefined;
  try {
    const completion = await criarCompletionComRetry(openai, {
      model: TEXT_PROMPT_BUILDER_MODEL,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `Você escreve prompts para gerar uma nova versão de uma arte publicitária existente usando GPT Image. A imagem enviada pelo usuário é a referência principal de conceito, conteúdo e identidade visual.

Sua função não é fazer um ajuste pontual. Sua função é criar uma nova variação melhorada da arte, preservando a ideia central, produto, marca, informações comerciais e intenção de venda.

Melhore a qualidade visual da peça como um diretor de arte: refine composição, hierarquia, iluminação, contraste, tipografia, espaçamento, acabamento, cenário e integração dos elementos. Corrija aparência amadora, excesso de poluição visual, fundo fraco, má distribuição de textos, baixa legibilidade e falta de impacto comercial.

Preserve por padrão: produto principal, nome da marca, logo, cores principais da identidade, textos importantes, preço, telefone/WhatsApp, endereço, CTA, proposta da arte e formato geral.

Não invente novas informações comerciais. Não altere preço, telefone, endereço, nome da marca ou produto. Não mude a logo. Não remova textos importantes, a menos que o usuário peça. Não transforme a arte em outro conceito completamente diferente.

Se o usuário pedir "melhorar mantendo a mesma ideia", crie uma versão mais profissional, organizada e visualmente refinada, mas mantendo o conceito original.
Se o usuário pedir "nova variação parecida", mantenha a mesma intenção de venda e informações principais, mas varie composição, fundo, iluminação e estilo visual.
Se o usuário pedir "mais premium", reduza aparência de panfleto, refine a paleta, use melhor respiro, tipografia mais elegante, iluminação mais sofisticada e composição mais limpa.
Se o usuário pedir "mais clean", simplifique a composição, reduza ruído visual, melhore espaço negativo e mantenha leitura clara.
Se o usuário pedir "mais chamativa", aumente impacto comercial com contraste, destaque de oferta e energia visual, mas sem deixar amador ou poluído.

A saída deve ser apenas o prompt final para geração da nova imagem, em INGLÊS (o modelo de imagem segue esse tipo de instrução de direção de arte com mais consistência em inglês), sem explicações, sem comentários e sem aspas ao redor de tudo.`,
        },
        { role: "user", content: descreverPedidoArteExistente(req) },
      ],
    });
    texto = completion.choices[0]?.message?.content?.trim();
  } catch (e) {
    console.error("[prompt-builder] melhorar arte existente falhou, usando fallback:", e);
    return { prompt: fallback, usouFallback: true };
  }
  if (!texto) return { prompt: fallback, usouFallback: true };
  return { prompt: texto, usouFallback: false };
}
