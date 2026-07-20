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
  type DirecaoTransformacao,
  type EstiloComunicacao,
  type IntensidadeVisual,
  type MensagemAjusteConversa,
  type ObjetivoMarketing,
  type TipoUsoAnexoAjuste,
} from "@/lib/types";

// Traduções em português (para manter o mesmo idioma do resto do contexto
// enviado ao prompt-builder, ver briefingParaTexto) dos campos do card
// rápido de criação (ver src/lib/briefing-card.ts) que não têm equivalente
// direto nos tipos legados (EstiloVisual já vem com paleta embutida;
// Objetivo é canal/destino, não objetivo de marketing).
//
// IMPORTANTE: EstiloComunicacao define APENAS identidade estética (a "cara"
// da peça) — nunca controla energia/impacto visual, isso é responsabilidade
// exclusiva de IntensidadeVisual (ver INTENSIDADES_VISUAIS logo abaixo). As
// duas dimensões são independentes e sempre combinadas juntas no prompt final
// (ver estiloParaTexto/intensidadeParaTexto/briefingParaTexto): por exemplo
// "Premium" + "Discreta" = campanha extremamente sofisticada e contida;
// "Premium" + "Impactante" = luxo com presença comercial forte; "Clean" +
// "Discreta" = estilo Apple; "Vibrante" + "Impactante" = promoção de açaí;
// "Minimalista" + "Impactante" = poucos elementos com muito impacto.
const ESTILOS_COMUNICACAO: Record<Exclude<EstiloComunicacao, "ia_decide">, string> = {
  premium: "estética sofisticada, poucos elementos, muito refinamento, hierarquia excelente, espaço negativo, texturas discretas, iluminação elegante, aspecto de marca premium — nunca exagerar em brilhos ou efeitos",
  moderno: "visual contemporâneo, layout dinâmico, elementos gráficos discretos, sensação de profundidade e de marca tecnológica/atual, organização limpa",
  clean: "layout extremamente limpo, poucos elementos, muito respiro, foco absoluto no produto, excelente legibilidade, paleta reduzida, sem excesso de efeitos",
  vibrante: "visual energético, cores fortes, mais contraste, sensação de movimento e energia, clima promocional — sem perder organização",
  minimalista: "remova tudo que não agrega valor: pouquíssimos elementos, muito espaço negativo, poucas cores, poucos textos, grande foco no produto, visual editorial",
};

// Nível de impacto/energia comercial da peça — dimensão independente do
// estilo (nunca altera a identidade estética escolhida acima, só a força com
// que ela é aplicada).
const INTENSIDADES_VISUAIS: Record<Exclude<IntensidadeVisual, "ia_decide">, string> = {
  discreta: "visual calmo, baixo contraste, poucos brilhos, poucos elementos chamativos — ideal para marcas sofisticadas",
  equilibrada: "mistura organização com impacto — nível padrão, adequado para a maioria das artes",
  impactante: "maior destaque para preço/CTA/oferta, maior contraste, maior profundidade, mais força visual e energia, sem exagerar e sem nunca perder legibilidade",
};

const OBJETIVOS_MARKETING_HINT: Record<Exclude<ObjetivoMarketing, "ia_decide">, string> = {
  vender_rapido: "tom direto de venda, senso de urgência e oferta clara, prioridade em converter rápido",
  divulgar_novidade: "tom de lançamento/novidade, destaque para o que é novo",
  chamar_whatsapp: "prioridade em levar o cliente a chamar no WhatsApp — CTA de contato bem visível",
  fortalecer_marca: "tom mais institucional e aspiracional, produto e marca como protagonistas, menos ênfase no preço",
};

// Direção de cores do card rápido — as 4 frases já eram dadas prontas em
// inglês na especificação original, mas o resto do contexto enviado ao
// prompt-builder (briefingParaTexto) é em português, então aqui elas viram
// frases em português equivalentes pra manter o texto consistente.
function direcaoDeCoresParaTexto(b: BriefingCompleto): string {
  if (b.preferenciaCores === "marca" && b.coresMarca?.trim()) {
    return `Use as cores da marca informadas pelo lojista (${b.coresMarca.trim()}) como paleta principal, equilibrando com tons neutros complementares para manter contraste, legibilidade e acabamento profissional. Não use cores do segmento que briguem com essa identidade.`;
  }
  if (b.preferenciaCores === "marca") {
    // Escolheu "cores da marca" mas não informou quais — sem base nenhuma
    // pra travar a composição numa identidade específica, cai pro critério
    // do segmento (nunca invente uma identidade visual não informada).
    return "O lojista não informou as cores específicas da marca — use uma paleta coerente com o segmento, produto, objetivo e estilo visual.";
  }
  if (b.preferenciaCores === "referencia") {
    if (b.temReferencia) {
      return "Há uma imagem de referência de cores/estilo anexada — use-a apenas para entender paleta principal, clima visual, nível de sofisticação e linguagem estética. Não copie a imagem literalmente, não a trate como produto e não a trate como logotipo. Extraia a direção visual e aplique numa composição publicitária original.";
    }
    // Pediu "seguir referência" mas não anexou nada — sem imagem não há o
    // que seguir; cai pro critério do segmento em vez de travar/inventar.
    return "O lojista pediu para seguir uma referência visual, mas nenhuma imagem de referência foi anexada — use uma paleta coerente com o segmento, produto, objetivo e estilo visual.";
  }
  if (b.preferenciaCores === "ia_decide") {
    return "Escolha a paleta de cores mais eficaz com base no produto, segmento, objetivo e estilo visual da peça.";
  }
  // "segmento" (padrão) ou não informado.
  return "Use uma paleta de cores coerente com o segmento, o produto, o objetivo e o estilo visual desta peça.";
}

// ==== Modo comida realista (regra GLOBAL do prompt-builder de imagem) ====
// Vale em TODOS os fluxos de imagem (criação, edição, melhoria, nova versão,
// variação, ajuste), não só no fluxo de criar arte nova. Para comida,
// realismo fotográfico vem ANTES de impacto visual — esta é a instrução mais
// forte do prompt final e vence "premium", "chamativo", "cinematográfico"
// etc. Aplicada de forma DETERMINÍSTICA (anexada ao prompt final, não só
// pedida ao modelo de texto), sempre em inglês (idioma do modelo de imagem),
// pra garantir que as frases obrigatórias sempre cheguem ao modelo.

// Seção obrigatória e forte — a mais importante do prompt quando há comida.
const FOOD_REALISM_REQUIREMENTS =
  "FOOD REALISM REQUIREMENTS (mandatory, stronger than any style or intensity instruction): Use realistic food photography. The food must look like a real photographed product, not a render, not CGI, not AI-generated food. Prioritize natural texture, believable imperfections, realistic moisture, natural fibers, plausible colors, real-world lighting and natural shadows. Avoid plastic shine, excessive gloss, fake fat, waxy texture, perfect surfaces, oversaturated colors, artificial smoke, fake steam, unrealistic anatomy, strange shapes, overprocessed food styling and 3D-rendered appearance. The chosen visual style and visual intensity may only change layout, typography, composition, graphic elements, hierarchy and the artwork's lighting/mood — they must never change the real appearance of the food itself (meat, burger, açaí, pizza or any other food item). The graphic design can be bold and commercial, but the food itself must remain photorealistic, natural and believable. If there is any conflict between visual impact and food realism, food realism wins.";

// Blocos por estado do produto de açougue/carne.
const MEAT_FRESH_BLOCK =
  "Show the meat as a real fresh butcher shop product. Use natural red tones, realistic fat marbling, visible muscle fibers, believable cut shape, natural moisture and professional food photography lighting. The meat must look fresh, raw and sellable, like a real butcher shop product. It must not look cooked, grilled, plastic, waxy, glossy, CGI or anatomically strange. Avoid cooked meat, grilled surface, barbecue gloss, plastic shine, varnished meat, fake fat, wax texture, overly smooth texture, oversaturated red, strange bone structure, unrealistic cut shape, artificial smoke, excessive cinematic glow and AI-generated food appearance.";

const MEAT_READY_BLOCK =
  "Show the food as a realistic cooked meat photograph, with natural browning, believable crust, realistic juiciness, subtle highlights, natural fat rendering and appetizing texture. It must look like a real food photo, not a 3D render. Avoid exaggerated crust, plastic shine, artificial fat, excessive smoke, rubbery meat, overly brown or orange color and perfect surfaces.";

const MEAT_BBQ_BLOCK =
  "Create a realistic barbecue atmosphere with subtle, minimal smoke, warm side lighting, dark wood or grill context, natural meat texture and believable food styling. The meat should look appetizing but not artificial. Avoid exaggerated cinematic smoke, too much fire, fake embers, overly glossy meat, 3D-rendered look and excessive effects.";

const NO_PHOTO_FOOD_NOTE =
  "If no product photo is provided, create a believable realistic food photograph based on common real-world appearance. Do not invent exaggerated shapes, perfect textures or fantasy food styling.";

// Detecção de comida por TEXTO (sem análise de imagem — os fluxos de
// edição/melhoria não têm briefing estruturado, então inferimos pelo pedido
// do lojista e/ou pelo prompt anterior da arte).
// JS `\b` trata letras acentuadas como "não-palavra", então uma palavra que
// TERMINA em vogal acentuada (açaí, café) nunca bate o `\b` de fechamento —
// por isso os limites de palavra aqui são lookarounds manuais que também
// tratam letras latinas acentuadas como parte da palavra.
const LETRA_PALAVRA = "A-Za-zÀ-ÖØ-öø-ÿ0-9_";
const INICIO_PALAVRA = `(?<![${LETRA_PALAVRA}])`;
const FIM_PALAVRA = `(?![${LETRA_PALAVRA}])`;

const PALAVRAS_COMIDA = new RegExp(
  `${INICIO_PALAVRA}(comida|aliment(o|ar|[íi]cio)|bebida|drink|refrigerante|suco|cerveja|caf[ée]|a[çc]ougue|carne|costela|picanha|frango|coxinha|linguic|corte bovino|bovin|churrasc|brasa|grelh|assad|restaurante|lanchonete|lanche|hamb[úu]rg|burger|pizza|a[çc]a[íi]|sorvete|sobremesa|doce|confeitaria|padaria|p[ãa]o|bolo|torta|marmita|delivery|prato|refei[çc][ãa]o|salgad|espetinho|feijoada|churrascaria|fruta|queijo|frios|pastel|a[çc][úu]car)${FIM_PALAVRA}`,
  "i",
);

const PALAVRAS_CARNE = new RegExp(
  `${INICIO_PALAVRA}(a[çc]ougue|carne|costela|picanha|frango|coxa|sobrecoxa|linguic|corte bovino|bovin|su[íi]n|alcatra|maminha|fraldinha|contrafil[ée]|cox[ãa]o|patinho|ac[ée]m|cupim|fil[ée] mignon|fil[ée]|bife|ossobuco|paleta|panceta|bacon)${FIM_PALAVRA}`,
  "i",
);

// true quando qualquer um dos textos passados envolver comida/alimento.
export function textoEnvolveComida(...textos: (string | null | undefined)[]): boolean {
  const juntos = textos.filter(Boolean).join(" ");
  return PALAVRAS_COMIDA.test(juntos);
}

type EstadoCarne = "cru_fresco" | "pronto_para_consumo" | "churrasco";

// Infere o estado correto do produto de carne pelo contexto textual (ver
// 1.1 da especificação): venda por kg / oferta do dia / açougue → cru;
// marmita / prato / restaurante / delivery → pronto; brasa / grelha /
// churrasco / assado / fim de semana → churrasco. Padrão de açougue = cru.
function estadoCarnePorTexto(texto: string): EstadoCarne | null {
  if (!PALAVRAS_CARNE.test(texto)) return null;
  if (/\b(brasa|grelh|churrasc|assad|espetinho|fim de semana|final de semana|domingo|s[áa]bado)\b/i.test(texto)) {
    return "churrasco";
  }
  if (/\b(marmita|prato pronto|prato feito|restaurante|delivery|refei[çc][ãa]o|pf\b|self.?service)\b/i.test(texto)) {
    return "pronto_para_consumo";
  }
  return "cru_fresco";
}

function blocoCarne(estado: EstadoCarne): string {
  if (estado === "churrasco") return MEAT_BBQ_BLOCK;
  if (estado === "pronto_para_consumo") return MEAT_READY_BLOCK;
  return MEAT_FRESH_BLOCK;
}

function estadoCarneDoSubmodo(b: BriefingCompleto): EstadoCarne | null {
  if (b.submodoAcougue === "produto_cru_fresco") return "cru_fresco";
  if (b.submodoAcougue === "pronto_para_consumo") return "pronto_para_consumo";
  if (b.submodoAcougue === "clima_churrasco") return "churrasco";
  // "ia_decide" ou ausente: infere pelo texto do produto/segmento.
  return estadoCarnePorTexto(`${b.nomeProduto ?? ""} ${b.descricaoProduto ?? ""} ${b.segmentoDetectado ?? ""} ${b.conceito ?? ""}`);
}

// Bloco de comida realista para o fluxo de CRIAÇÃO (tem briefing com
// modoComidaRealista/submodoAcougue já definidos pelo agente).
function blocoComidaRealistaCriacao(b: BriefingCompleto): string | null {
  if (!b.modoComidaRealista) return null;
  const partes = [FOOD_REALISM_REQUIREMENTS];
  const estado = estadoCarneDoSubmodo(b);
  if (estado) partes.push(blocoCarne(estado));
  if (!b.temFotoProduto) partes.push(NO_PHOTO_FOOD_NOTE);
  return partes.join(" ");
}

// Aplicada de forma DETERMINÍSTICA ao prompt final da criação (via IA e no
// fallback) — garante que as frases obrigatórias de comida realista sempre
// cheguem ao modelo de imagem.
function aplicarComidaRealista(prompt: string, b: BriefingCompleto): string {
  const bloco = blocoComidaRealistaCriacao(b);
  return bloco ? `${prompt}\n\n${bloco}` : prompt;
}

// Reforço de comida realista para os fluxos que operam sobre uma imagem
// EXISTENTE (ajuste, edição, melhoria, nova versão, variação). Só entra se o
// texto de contexto (pedido do lojista + prompt anterior da arte) envolver
// comida — nesses fluxos não há briefing estruturado com modoComidaRealista.
// Idempotente: se o prompt já contém a seção, não duplica.
export function reforcarComidaRealista(
  promptFinal: string,
  opts: { contexto: string; fluxo: "melhoria" | "nova_versao" | "edicao" },
): string {
  if (promptFinal.includes("FOOD REALISM REQUIREMENTS")) return promptFinal;
  if (!textoEnvolveComida(opts.contexto)) return promptFinal;
  const partes = [FOOD_REALISM_REQUIREMENTS];
  const estado = estadoCarnePorTexto(opts.contexto);
  if (estado) partes.push(blocoCarne(estado));
  if (opts.fluxo === "melhoria" || opts.fluxo === "nova_versao") {
    partes.push(
      "The food realism requirements are mandatory. The design may change, but the food must remain realistic, natural and believable.",
    );
  } else {
    partes.push(
      "Change only the requested element and preserve the food realism. Do not alter the food texture, color, moisture, shape or natural appearance unless explicitly requested. Preserve the food with realistic texture, natural colors and believable appearance. Do not make the food more glossy, plastic, artificial, CGI-like or overprocessed.",
    );
  }
  return `${promptFinal}\n\n${partes.join(" ")}`;
}

// Frase de comida SEMPRE presente (safe no-op para não-comida) nos prompts
// de melhoria/nova-versão/edição — reforça realismo caso a arte-base tenha
// comida, mesmo quando o texto do pedido não menciona (não conseguimos
// analisar a imagem-base, então esta frase condicional é a rede de segurança).
const FOOD_CONDITIONAL_HINT =
  "If the artwork contains any food, drink or edible product, it must remain photorealistic and natural — real texture, natural colors, believable moisture — never plastic, glossy, waxy, CGI-like, oversaturated or AI-looking.";

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

## Estilo visual x Intensidade visual (duas camadas independentes)
O briefing traz duas informações que NUNCA devem ser misturadas: "Estilo visual" define a identidade estética da peça (Premium, Moderno, Clean, Vibrante ou Minimalista) e "Intensidade visual" define apenas o nível de impacto/energia comercial (Discreta, Equilibrada ou Impactante) — nunca o contrário. A intensidade nunca substitui nem contradiz o estilo escolhido, só regula a força com que ele é aplicado. Combine as duas sempre: Premium + Discreta = campanha extremamente sofisticada e contida; Premium + Impactante = luxo com presença comercial forte; Clean + Discreta = estilo Apple; Clean + Equilibrada = catálogo premium; Moderno + Equilibrada = empresa de tecnologia; Moderno + Impactante = delivery moderno; Vibrante + Equilibrada = restaurante elegante; Vibrante + Impactante = promoção de açaí; Minimalista + Discreta = editorial; Minimalista + Impactante = poucos elementos com muito impacto visual.

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

## Referência de cores/estilo (quando a direção de cores pedir "seguir referência")
Essa imagem representa só paleta, clima visual, nível de sofisticação e linguagem estética — nunca é o produto da peça nem a logo da marca. Extraia a direção visual dela (não copie literalmente) e aplique numa composição publicitária original.

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

// Identidade estética (EstiloComunicacao) — NUNCA inclui impacto/energia
// visual, isso é intensidadeParaTexto logo abaixo (dimensão independente).
function estiloParaTexto(b: BriefingCompleto): string {
  if (b.estiloVisual === "estilo-livre") {
    return `descrito pelo lojista em suas palavras: "${b.estiloLivre ?? ""}" (traduza em atributos visuais concretos)`;
  }
  if (b.estiloVisual) return `${ESTILOS[b.estiloVisual].label} — ${ESTILOS[b.estiloVisual].hint}`;
  // Fluxo rápido de criação (card agrupado, ver briefing-card.ts) usa
  // estiloComunicacao no lugar do preset legado — sem paleta embutida
  // (a cor vem à parte, ver direcaoDeCoresParaTexto).
  if (b.estiloComunicacao && b.estiloComunicacao !== "ia_decide") return ESTILOS_COMUNICACAO[b.estiloComunicacao];
  if (b.estiloComunicacao === "ia_decide") return "a critério do diretor de arte, com base no produto, segmento e objetivo";
  return "não especificado — use um estilo comercial neutro e elegante";
}

// Intensidade/impacto visual — dimensão independente do estilo acima. Só
// existe no fluxo rápido de criação (não há equivalente no preset legado
// EstiloVisual); quando ausente, cai pro padrão "equilibrada".
function intensidadeParaTexto(b: BriefingCompleto): string {
  if (b.intensidadeVisual && b.intensidadeVisual !== "ia_decide") return INTENSIDADES_VISUAIS[b.intensidadeVisual];
  if (b.intensidadeVisual === "ia_decide") return "a critério do diretor de arte, com base no produto, segmento e objetivo";
  return INTENSIDADES_VISUAIS.equilibrada;
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
    `Estilo visual (identidade estética): ${estiloParaTexto(b)}`,
    `Intensidade visual (nível de impacto/energia — dimensão independente do estilo, nunca muda a identidade estética): ${intensidadeParaTexto(b)}`,
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
  if (b.objetivoMarketing && b.objetivoMarketing !== "ia_decide") {
    linhas.push(`Objetivo de marketing: ${OBJETIVOS_MARKETING_HINT[b.objetivoMarketing]}`);
  }
  linhas.push(`Direção de cores: ${direcaoDeCoresParaTexto(b)}`);
  if (b.modoComidaRealista) {
    linhas.push(
      "Modo comida realista ativado: para alimentos, realismo vem antes de exagero visual. A comida deve parecer fotografada de verdade, com textura natural, pequenas imperfeições reais, volume coerente, iluminação realista e aparência vendável — nunca aparência de CGI, render 3D, brilho plástico ou banco de imagens genérico gerado por IA.",
    );
  }

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
        : b.estiloComunicacao && b.estiloComunicacao !== "ia_decide"
          ? ESTILOS_COMUNICACAO[b.estiloComunicacao]
          : "estilo comercial neutro e elegante";
  const intensidadeHint = intensidadeParaTexto(b);
  const nivel = NIVEIS_VISUAIS[b.nivelVisual ?? "profissional-equilibrado"].hint;
  const producao = NIVEIS_PRODUCAO_VISUAL[b.nivelProducaoVisual ?? "premium-editorial"].hint;
  const c = b.conteudoAnuncio;
  const partes: string[] = [
    `Crie uma arte publicitária ${fmt.aspecto} profissional e realista para ${TIPOS_PECA[b.tipoPeca]?.label.toLowerCase() ?? "anúncio"} do produto "${b.nomeProduto}"${b.descricaoProduto ? ` (${b.descricaoProduto})` : ""},`,
    `${estiloHint}; nível de impacto visual: ${intensidadeHint}; ${nivel}, com produção visual no nível "${producao}", equilibrando sofisticação editorial com clareza comercial,`,
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
  partes.push(`Direção de cores: ${direcaoDeCoresParaTexto(b)}`);
  if (b.objetivoMarketing && b.objetivoMarketing !== "ia_decide") {
    partes.push(`Tom da comunicação: ${OBJETIVOS_MARKETING_HINT[b.objetivoMarketing]}.`);
  }
  partes.push(`Composição pronta para ${fmt.descricao}, fugindo de layout de template óbvio, com no máximo 3 blocos de texto principais, sem estética de panfleto barato, sem fundo vermelho/laranja saturado genérico, sem amarelo neon e sem excesso de texto.`);
  return aplicarComidaRealista(partes.join(" "), b);
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
    return { prompts: prompts.map((p: string) => aplicarComidaRealista(p, b)), usouFallback: false };
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
  return `Make a precise local edit only. Apply exactly this change: "${pedidoUsuario}". Any text that must appear in the image must stay exactly as written above, in its original language — do not translate, rewrite, or correct it. Preserve the original artwork exactly, including composition, product, background, lighting, color palette, existing text, price, phone number, address, typography, logo, logo colors, logo proportions, logo position and brand identity, unless explicitly requested otherwise. Preserve the original aspect ratio and output format of the attached image; do not change the composition format unless explicitly requested. Do not redraw the artwork and do not change any element that was not explicitly requested. ${FOOD_CONDITIONAL_HINT}`;
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

Always preserve the original artwork exactly, including composition, background, lighting, colors, typography, product, logo, logo colors, logo proportions, logo position, brand identity, price, phone number, address, and all existing text, unless the user explicitly requested changing one of those elements. Always preserve the original aspect ratio and output format of the artwork — never change the composition format unless the user explicitly requests a new format (e.g. "transform into feed", "make it a story").

If the artwork contains any food, drink, meat or edible product, preserve its photorealistic appearance — real texture, natural colors, believable moisture. Never make the food look more glossy, plastic, artificial, CGI-like or overprocessed as a side effect of an unrelated edit.

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
  const reforcado = reforcarComidaRealista(texto, { contexto: `${promptAnterior} ${pedidoUsuario}`, fluxo: "edicao" });
  return { prompt: reforcado, usouFallback: false };
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

Do not redraw the whole artwork. Do not recreate the layout. Do not change the brand identity. Do not change the logo color as a side effect of background, contrast, light or palette adjustments. Preserve the original aspect ratio and output format of the artwork — never change the composition format unless the user explicitly requests a new format.

If the artwork contains any food, drink, meat or edible product, preserve its photorealistic appearance — real texture, natural colors, believable moisture. Never make the food look more glossy, plastic, artificial, CGI-like or overprocessed as a side effect of an unrelated edit.

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
  const reforcado = reforcarComidaRealista(texto, { contexto: pedidoUsuario, fluxo: "edicao" });
  return { prompt: reforcado, usouFallback: false };
}

// Fallback determinístico em português pro caminho gpt-image-2 (usado só
// quando ENABLE_FLUX_EDIT=false, ver models.ts) — gpt-image-2 segue
// instrução em português com fidelidade alta, incluindo texto renderizado
// corretamente (testado ao vivo, sem os erros de digitação que o Flux
// Kontext às vezes introduz em textos não relacionados ao pedido).
function fallbackAjusteCirurgicoPortugues(pedidoUsuario: string): string {
  return `Aplique somente esta alteração: ${pedidoUsuario}. Preserve exatamente todo o restante da arte original, incluindo composição geral, enquadramento, proporção da arte, produto, formato do produto, cor do produto, textura do produto, fundo, iluminação, sombras, reflexos, paleta de cores, estilo visual aprovado, tipografia, hierarquia visual, todos os textos existentes, preço, telefone/WhatsApp, endereço, CTA, nome da marca, logo, cores da logo, formato da logo, proporção da logo, posição da logo, nitidez da logo e identidade visual da marca, a menos que o pedido tenha citado explicitamente um desses elementos. Preserve o formato/proporção original da imagem (não mude para outro formato a menos que o usuário peça explicitamente). Não recrie a arte inteira e não mude nenhum elemento que não tenha sido pedido. ${FOOD_CONDITIONAL_HINT}`;
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

Regra de formato/proporção (obrigatória):
Preserve o formato e a proporção (aspect ratio) da imagem original. Nunca mude o formato da arte por conta própria — só mude se o usuário pedir explicitamente (ex: "transforma em feed", "quero em story", "muda para quadrado"). Inclua no prompt final: "Preserve the original aspect ratio and output format of the attached image. Do not change the composition format unless the user explicitly requests a new format."

Regra para comida (obrigatória quando houver alimento na arte):
Se a arte contiver comida, bebida, carne, açougue, açaí, sobremesa ou qualquer alimento, preserve o realismo fotográfico do alimento. Não deixe a comida mais brilhante, plástica, artificial, com cara de CGI ou render 3D, mesmo que o ajuste peça "mais premium" ou "mais chamativo". A comida deve continuar com textura real, cores naturais e aparência crível.

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
  const reforcado = reforcarComidaRealista(texto, { contexto: `${promptAnterior} ${pedidoUsuario}`, fluxo: "edicao" });
  return { prompt: reforcado, usouFallback: false };
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

Regra de formato/proporção (obrigatória): preserve o formato e a proporção (aspect ratio) do design original; só mude se o usuário pedir explicitamente (ex: "transforma em feed", "quero em story"). Inclua no prompt final: "Preserve the original aspect ratio and output format of the attached image. Do not change the composition format unless the user explicitly requests a new format."

Regra para comida (obrigatória se houver alimento): se o design tiver comida, carne, bebida ou qualquer alimento, preserve o realismo fotográfico — textura real, cores naturais, sem deixar mais brilhante, plástico, artificial ou com cara de IA/CGI, mesmo em pedidos de "mais premium"/"mais chamativo".

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
  const reforcado = reforcarComidaRealista(texto, { contexto: pedidoUsuario, fluxo: "edicao" });
  return { prompt: reforcado, usouFallback: false };
}

export type TipoPedidoAjuste = "ajuste" | "nova-criacao" | "ambiguo";

export interface ClassificacaoAjuste {
  tipo: TipoPedidoAjuste;
  // Estado da mini conversa de ajuste — enquanto for "precisa_esclarecimento"
  // nunca é seguro gerar (ver AjusteConversa.tsx, que só libera o botão de
  // gerar/cobra crédito quando o status vira "pronto_para_confirmar").
  status: "precisa_esclarecimento" | "pronto_para_confirmar";
  pergunta: string | null; // pergunta de esclarecimento, quando status = precisa_esclarecimento
  resumo: string; // frase curta e específica dizendo o que vai mudar, para confirmação
  elementosAlvo: string[]; // o que o usuário realmente pediu para mudar
  elementosProtegidos: string[]; // tudo que deve permanecer igual
  usaAnexo: boolean; // true quando há uma imagem anexada nesta conversa de ajuste
  tipoUsoAnexo: TipoUsoAnexoAjuste; // "indefinido" força esclarecimento antes de gerar
  precisaConfirmacao: boolean; // ambíguo, nova criação, ou anexo sem uso definido
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
const PALAVRAS_NOVA_CRIACAO = /\b(refaz|refazer|refeito|n[aã]o gostei|cria outra|completamente diferente|come[cç]a de novo|do zero)\b/i;
// Texto exato, preço, contato, bandeiras/ícones e logo são elementos onde um
// overlay do app (HTML/CSS/SVG) tende a ser mais preciso que edição
// generativa — que pode reinterpretar, redesenhar ou distorcer esse tipo de
// elemento em vez de só posicioná-lo.
const PALAVRAS_OVERLAY =
  /\b(texto|frase|palavra|escrit[ao]|pre[cç]o|telefone|whatsapp|endere[cç]o|contato|bandeira|[ií]cone|logo|logotipo)\b/i;

const TIPOS_USO_ANEXO_VALIDOS: TipoUsoAnexoAjuste[] = [
  "logo",
  "produto",
  "fundo",
  "referencia_estilo",
  "elemento_extra",
  "indefinido",
];

const PERGUNTA_ANEXO_INDEFINIDO =
  "Você quer usar essa imagem como referência de estilo, como produto, como logo ou como fundo?";
const PERGUNTA_NOVA_CRIACAO =
  "Isso parece uma nova versão, não um ajuste pontual. Quer criar uma nova versão mantendo as mesmas informações?";

function fallbackClassificacao(pedido: string, temAnexo: boolean): ClassificacaoAjuste {
  const tipo: TipoPedidoAjuste = PALAVRAS_NOVA_CRIACAO.test(pedido) ? "nova-criacao" : "ajuste";
  // Sem IA disponível não dá pra inferir com segurança nem ambiguidade fina
  // nem o uso pretendido de um anexo — nesses dois casos preferimos parar e
  // perguntar a arriscar gerar algo que o lojista não pediu.
  const status: ClassificacaoAjuste["status"] = tipo === "nova-criacao" || temAnexo ? "precisa_esclarecimento" : "pronto_para_confirmar";
  const pergunta = tipo === "nova-criacao" ? PERGUNTA_NOVA_CRIACAO : temAnexo ? PERGUNTA_ANEXO_INDEFINIDO : null;
  return {
    tipo,
    status,
    pergunta,
    resumo: pedido,
    elementosAlvo: [pedido],
    elementosProtegidos: ELEMENTOS_PROTEGIDOS_BASE,
    usaAnexo: temAnexo,
    tipoUsoAnexo: "indefinido",
    precisaConfirmacao: status === "precisa_esclarecimento",
    sugerirOverlay: PALAVRAS_OVERLAY.test(pedido),
  };
}

const SYSTEM_AJUSTE_CONVERSA = `Você conduz uma mini conversa de ajuste para uma arte publicitária já existente. Sua função é entender exatamente o que o usuário quer alterar antes de gastar crédito com geração. Você recebe o histórico da conversa de ajuste (mensagens do usuário e suas perguntas/resumos anteriores) e decide o próximo passo.

Se o pedido for claro, escreva em "resumo" uma frase curta e específica dizendo exatamente o que será alterado e que o restante será preservado, e marque status = "pronto_para_confirmar".

Se o pedido for ambíguo (não deixar claro qual elemento deve mudar, ou puder afetar logo, cores da marca, produto, textos principais ou composição inteira sem ter sido pedido), faça uma pergunta objetiva e curta em "pergunta", classifique tipo = "ambiguo" e marque status = "precisa_esclarecimento". Nunca gere um resumo de confirmação nesse caso.

Se a última mensagem do usuário indicar que há uma imagem anexada (usaAnexo = true no contexto): identifique se ela deve ser usada como logo, produto, fundo, referência de estilo ou elemento extra (bandeira, ícone, selo, embalagem etc). Se estiver claro, defina tipoUsoAnexo com esse valor e mencione isso explicitamente no resumo (ex: "Vou trocar a logo pela imagem anexada, preservando o restante da arte"). Se não estiver claro, defina tipoUsoAnexo = "indefinido", escreva em "pergunta" algo como "Você quer usar essa imagem como referência de estilo, como produto, como logo ou como fundo?", classifique tipo = "ambiguo" e marque status = "precisa_esclarecimento".

Se o pedido parecer uma nova criação disfarçada (recomeçar do zero, mudar o conceito inteiro, trocar o produto principal, mudar tudo ao mesmo tempo, dizer que não gostou e quer outra arte), classifique tipo = "nova-criacao", escreva em "pergunta" algo como "Isso parece uma nova versão, não um ajuste pontual. Quer criar uma nova versão mantendo as mesmas informações?" e marque status = "precisa_esclarecimento". Nunca trate isso como ajuste cirúrgico.

Sempre identifique elementosAlvo (o que muda) e elementosProtegidos (tudo que deve continuar igual). Considere logo, cores da logo, formato da logo, proporção da logo, posição da logo, produto, todos os textos, preço, telefone, endereço, composição, fundo, estilo e identidade visual como protegidos por padrão, a menos que tenham sido explicitamente citados como alvo da alteração.

Nunca force a geração quando ainda houver dúvida: enquanto status for "precisa_esclarecimento", presuma que não é seguro gerar.

Responda somente em JSON válido, neste formato: {"tipo": "ajuste"|"nova-criacao"|"ambiguo", "status": "precisa_esclarecimento"|"pronto_para_confirmar", "pergunta": "pergunta de esclarecimento, ou null quando não houver", "resumo": "frase curta e específica do que vai mudar", "elementosAlvo": ["..."], "elementosProtegidos": ["..."], "usaAnexo": true|false, "tipoUsoAnexo": "logo"|"produto"|"fundo"|"referencia_estilo"|"elemento_extra"|"indefinido", "precisaConfirmacao": true|false}`;

// Conduz a mini conversa de ajuste sobre uma arte já existente (ver
// MensagemAjusteConversa em types.ts e o componente AjusteConversa.tsx que
// consome isso). Decide, turno a turno, se o pedido já está claro o
// suficiente pra confirmar a geração (chamando /api/adjust ou
// /api/edit-design) ou se precisa perguntar antes — nunca gasta crédito
// sozinho, isso só acontece quando o usuário confirma a geração.
export async function classificarPedidoAjuste(
  historico: MensagemAjusteConversa[],
  temAnexo: boolean,
): Promise<ClassificacaoAjuste> {
  const ultimoPedido = [...historico].reverse().find((m) => m.role === "user")?.content ?? "";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallbackClassificacao(ultimoPedido, temAnexo);

  const openai = new OpenAI({ apiKey, timeout: 15_000 });
  let texto: string | null | undefined;
  try {
    const completion = await criarCompletionComRetry(openai, {
      model: TEXT_ROUTER_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_AJUSTE_CONVERSA },
        ...historico.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: `[contexto: usaAnexo=${temAnexo ? "true" : "false"} na última mensagem do usuário]` },
      ],
    });
    texto = completion.choices[0]?.message?.content;
  } catch (e) {
    console.error("[prompt-builder] classificação de ajuste (conversa) falhou:", e);
    return fallbackClassificacao(ultimoPedido, temAnexo);
  }

  if (!texto) return fallbackClassificacao(ultimoPedido, temAnexo);
  try {
    const j = JSON.parse(texto);
    const tipo: TipoPedidoAjuste = ["ajuste", "nova-criacao", "ambiguo"].includes(j.tipo) ? j.tipo : "ajuste";
    const pergunta = typeof j.pergunta === "string" && j.pergunta.trim() ? j.pergunta.trim() : null;
    const resumo = typeof j.resumo === "string" && j.resumo.trim() ? j.resumo.trim() : ultimoPedido;
    const elementosAlvo = Array.isArray(j.elementosAlvo)
      ? j.elementosAlvo.filter((x: unknown) => typeof x === "string")
      : [ultimoPedido];
    const elementosProtegidos = Array.isArray(j.elementosProtegidos)
      ? j.elementosProtegidos.filter((x: unknown) => typeof x === "string")
      : ELEMENTOS_PROTEGIDOS_BASE;
    const usaAnexo = j.usaAnexo === true || temAnexo;
    const tipoUsoAnexoBruto: TipoUsoAnexoAjuste = TIPOS_USO_ANEXO_VALIDOS.includes(j.tipoUsoAnexo) ? j.tipoUsoAnexo : "indefinido";

    // Nunca libera geração com anexo sem uso definido, mesmo que o modelo
    // tenha (incorretamente) marcado status = pronto_para_confirmar.
    const precisaEsclarecerAnexo = usaAnexo && tipoUsoAnexoBruto === "indefinido";
    const status: ClassificacaoAjuste["status"] =
      j.status === "precisa_esclarecimento" || precisaEsclarecerAnexo ? "precisa_esclarecimento" : "pronto_para_confirmar";
    const perguntaFinal =
      status === "precisa_esclarecimento" ? (precisaEsclarecerAnexo && !pergunta ? PERGUNTA_ANEXO_INDEFINIDO : pergunta) : null;
    const precisaConfirmacao = j.precisaConfirmacao === true || status === "precisa_esclarecimento";

    return {
      tipo,
      status,
      pergunta: perguntaFinal,
      resumo,
      elementosAlvo,
      elementosProtegidos,
      usaAnexo,
      tipoUsoAnexo: tipoUsoAnexoBruto,
      precisaConfirmacao,
      sugerirOverlay: PALAVRAS_OVERLAY.test(ultimoPedido),
    };
  } catch (e) {
    // Falha de PARSE (conteúdo não é JSON válido) é um erro diferente de
    // falha de API — nunca deixa o texto cru do modelo vazar pro chamador.
    console.error("[prompt-builder] resposta de classificação não é JSON válido:", e, texto);
    return fallbackClassificacao(ultimoPedido, temAnexo);
  }
}

// ==== Transformar uma arte existente (fluxo rápido, sem briefing) ====
// Diferente do ajuste cirúrgico (montarPromptAjuste*, já existente pra
// trocar um detalhe específico como preço/texto/logo): aqui a intenção é
// criar uma versão MELHORADA (mesma estrutura, mais polida) ou uma versão
// NOVA (mesmas informações, design diferente) da arte enviada. Pedidos
// claramente pontuais são sinalizados à parte (ver pareceAjustePontual)
// pra redirecionar pro fluxo de edição de detalhe em vez deste.
const PALAVRAS_AJUSTE_PONTUAL =
  /\b(s[oó]\s+(troca|muda|altera|remove|tira|ajusta|diminui|aumenta|coloca|adiciona)|diminui(r)?\s+a\s+logo|aumenta(r)?\s+a\s+logo|move(r)?\s+a\s+logo|remove(r)?\s+(esse|este|o|a)\s+(texto|selo|elemento)|troca(r)?\s+(o|a)\s+(pre[cç]o|texto|cor|telefone|endere[cç]o|whatsapp))\b/i;

// Heurística leve (não bloqueante) pra avisar/redirecionar o lojista quando
// o pedido nesse fluxo parece na verdade um ajuste pontual — esse fluxo
// gera uma peça nova/melhorada a partir da referência, não faz edição
// cirúrgica de um elemento só (isso já existe no fluxo de editar detalhe).
export function pareceAjustePontual(texto: string): boolean {
  return PALAVRAS_AJUSTE_PONTUAL.test(texto);
}

const DESCRICAO_DIRECAO: Record<Exclude<DirecaoTransformacao, "personalizado">, string> = {
  profissional:
    "mais profissional (melhora técnica de design: hierarquia, alinhamento, espaçamento, contraste e legibilidade, mantendo a proposta comercial com acabamento mais bem feito)",
  clean:
    "mais clean (simplificação visual: reduzir excesso de informação, efeitos, brilhos e poluição visual, deixando a arte mais leve, organizada e fácil de ler)",
  premium:
    "mais premium (elevação de valor percebido: versão mais sofisticada e refinada, reduzindo cara de panfleto e melhorando fundo, luz, tipografia, composição e acabamento)",
  chamativa:
    "mais chamativa (maior impacto comercial: mais força de venda, destacando produto, preço, oferta e chamada principal, sem virar bagunça ou arte amadora)",
  moderna: "mais moderna",
  divertida: "mais divertida",
  menos_ia:
    "menos cara de IA (redução de artificialidade: diminuir brilho exagerado, neon genérico, texto 3D forçado, sombras irreais e saturação excessiva)",
  ia_decide: "deixar a IA decidir a melhor direção",
};

// Mesmas chaves de direção do modo "melhorar" (ver DESCRICAO_DIRECAO acima),
// mas com a linguagem virada pra "campanha nova" — usada só quando
// modoTransformacao é nova_versao_criativa (ver descreverPedidoArteExistente
// logo abaixo). Nunca reutilizar DESCRICAO_DIRECAO aqui: aquela fala em
// "melhorar"/"reduzir"/"elevar" o que já existe, e é exatamente essa
// linguagem que fazia o modelo tratar "nova versão" como uma evolução da
// mesma composição em vez de uma campanha nova.
const DESCRICAO_DIRECAO_NOVA_VERSAO: Record<Exclude<DirecaoTransformacao, "personalizado">, string> = {
  profissional:
    "nova campanha com melhor organização, melhor hierarquia e acabamento profissional — não copiar a composição atual, criar um layout completamente novo",
  clean:
    "campanha totalmente nova com poucos elementos, muito espaço negativo, layout completamente diferente e grande foco no produto",
  premium:
    "campanha totalmente nova com aparência sofisticada: nova direção de arte, nova composição, novo layout, visual digno de grandes marcas",
  chamativa:
    "campanha totalmente nova muito mais voltada para conversão: maior impacto, mais força comercial, maior destaque para preço e oferta — nunca reutilizar a composição anterior",
  moderna: "campanha totalmente nova com linguagem visual contemporânea — layout, grid e composição inteiramente novos",
  divertida: "campanha totalmente nova com tom descontraído e energético — layout, grid e composição inteiramente novos",
  menos_ia:
    "nova campanha com direção extremamente natural, sem brilhos exagerados, sem efeitos artificiais e sem aparência genérica de IA — a composição também deve ser nova",
  ia_decide: "a IA escolhe automaticamente uma direção criativa completamente diferente da arte original",
};

function descreverPedidoArteExistente(
  req: Pick<ArteExistenteRequest, "modoTransformacao" | "direcao" | "instrucaoUsuario">,
): string {
  const ehNovaVersao = req.modoTransformacao === "nova_versao_criativa";
  const linhas: string[] = [
    ehNovaVersao
      ? "O lojista quer CRIAR UMA NOVA VERSÃO da arte existente — isso NÃO é uma evolução da mesma peça (isso é o modo \"melhorar\", que segue outro fluxo). A arte enviada serve só como fonte de produto, preço, promoção, logo, telefone, endereço, CTA e identidade da campanha. A composição, o grid, a hierarquia e a direção de arte devem ser recriados do zero, como se outro diretor de arte tivesse recebido o mesmo briefing sem nunca ver a arte original."
      : "O lojista quer MELHORAR a arte existente: mesma campanha, mesmas informações, mas uma composição visivelmente melhor — pode reorganizar layout, hierarquia e distribuição dos elementos, não é só clarear ou polir a mesma peça.",
  ];
  if (req.direcao && req.direcao !== "personalizado") {
    const descricoes = ehNovaVersao ? DESCRICAO_DIRECAO_NOVA_VERSAO : DESCRICAO_DIRECAO;
    linhas.push(`Direção desejada: ${descricoes[req.direcao]}.`);
  }
  if (req.instrucaoUsuario?.trim()) {
    linhas.push(`Instrução específica do lojista: ${req.instrucaoUsuario.trim()}`);
  }
  return linhas.join("\n");
}

const PROMPT_BASE_MELHORIA_RECOMPOSITIVA =
  `Use the uploaded artwork as the main reference for content, product, brand and sales message. Create a clearly improved version of the same advertising campaign. Preserve all important commercial information exactly, including product names, prices, phone number, address, CTA, brand name and logo. Keep the same sales intent and main message, but do not copy the original layout rigidly. Improve the composition noticeably. You may reorganize the layout, hierarchy, spacing, background, product placement, price treatment, typography and visual balance as needed to make the artwork stronger. Preserve the campaign, not the exact structure. Preserve the original aspect ratio and output format of the attached image. Keep the same image format/proportion as the original uploaded design. Do not change the composition format unless the user explicitly requests a new format. The result must look noticeably better and more professionally designed, not just brighter or slightly polished. Do not invent new information, do not change prices, do not change the logo, and do not turn it into a completely different campaign. ${FOOD_CONDITIONAL_HINT}`;

const PROMPT_BASE_NOVA_VERSAO =
  `Use the uploaded artwork only as a source of campaign information, not as a layout or composition reference. Preserve only the product, price, promotion/offer, logo, phone number, address, CTA and brand identity of the campaign. Every other visual aspect must be reinvented — this is not a refinement of the existing design, it is a brand new campaign. Creating a genuinely new visual solution is mandatory. Significantly change the composition, grid, framing, hierarchy, product position, text position, price position, the relationship between image and typography, background, art direction and graphic language. The new artwork must look like it was created by a different art director who received the same briefing but never saw the original artwork. Someone comparing both artworks side by side must immediately recognize them as different campaigns for the same product. Never just rearrange small elements. Never just swap shadows, colors or fonts while keeping the same composition. Create a new campaign using exactly the same information. Preserve the original aspect ratio and output format of the attached image. Keep the same image format/proportion as the original uploaded design. Do not change the composition format unless the user explicitly requests a new format. Keep all product names, prices, phone number, address, CTA, logo and brand identity accurate. Do not invent new commercial information. ${FOOD_CONDITIONAL_HINT}`;

function fallbackTransformarArteExistente(
  req: Pick<ArteExistenteRequest, "modoTransformacao" | "instrucaoUsuario">,
): string {
  const base =
    req.modoTransformacao === "melhoria_recompositiva" ? PROMPT_BASE_MELHORIA_RECOMPOSITIVA : PROMPT_BASE_NOVA_VERSAO;
  const instrucao = req.instrucaoUsuario?.trim();
  return instrucao ? `${base} ${instrucao}.` : base;
}

const SYSTEM_MELHORIA_RECOMPOSITIVA = `Você escreve prompts para o GPT Image melhorar uma arte publicitária existente. Grau de liberdade criativa: MÉDIO. Isso NÃO é um ajuste cirúrgico (ajuste cirúrgico já existe no fluxo de editar detalhe) — o resultado precisa parecer uma versão claramente melhorada, não a mesma arte apenas mais clara ou com contraste ajustado.

Preserve exatamente: a ideia principal da campanha, produto, marca, logo, preço, informações comerciais, telefone, endereço, CTA e mensagem principal.

Preserve o conceito, mas NÃO preserve rigidamente: o layout original, a posição exata dos blocos, a composição geral ou a distribuição dos elementos. Você pode: mudar a posição dos produtos, melhorar a distribuição dos blocos, criar cards mais bonitos, redesenhar a área de preço, melhorar o fundo, alterar a hierarquia, aumentar o foco no produto, reduzir poluição visual, mudar o equilíbrio entre texto e imagem, e deixar a arte mais comercial e profissional.

Nunca limite a melhoria a brilho, contraste ou polimento superficial — isso é o erro mais comum a evitar aqui. Ao mesmo tempo, não recrie uma campanha totalmente diferente sem relação visual com a original (isso é o modo "nova versão", não este).

Prompt-base (adapte ao pedido, não copie literalmente): "${PROMPT_BASE_MELHORIA_RECOMPOSITIVA}"

O prompt final que você escrever deve sempre conter, adaptado ao contexto, estas 6 frases: "Do not copy the original layout rigidly.", "Improve the composition noticeably.", "You may reorganize the layout while preserving the same information and sales intent.", "Do not limit the improvement to brightness, contrast or small polish.", "Preserve the campaign, not the exact structure.", "Keep the original format/aspect ratio unless the user explicitly asks to change it."

Se o lojista pedir uma direção específica (mais profissional, mais clean, mais premium, melhorar legibilidade, reduzir poluição visual, ou deixar a IA decidir), incorpore isso mantendo sempre o grau de liberdade MÉDIO.

Regra de formato: o formato/proporção da arte original (story 9:16, feed 4:5 ou quadrado 1:1) deve ser preservado — só sugira mudança de formato se o lojista pedir isso explicitamente (ex: "transforma em feed", "quero em story").

Antes de finalizar, confira este checklist (corrija o prompt antes de responder se qualquer resposta for "não"): o prompt permite mudança clara de composição? Permite reorganizar blocos? Permite redesenhar cards/preço? Pede melhoria perceptível? Evita dizer para preservar o layout rigidamente? Preserva o formato original?

A saída deve ser apenas o prompt final em INGLÊS (o modelo de imagem segue instrução de direção de arte com mais consistência em inglês), sem explicações, sem comentários e sem aspas ao redor de tudo.`;

const SYSTEM_NOVA_VERSAO_CRIATIVA = `Você escreve prompts para o GPT Image criar uma campanha TOTALMENTE NOVA a partir de uma arte publicitária existente, usando a arte enviada apenas como fonte de informações da campanha — nunca como referência de composição. Grau de liberdade criativa: MÁXIMO.

Este modo é fundamentalmente diferente do modo "melhorar" (que evolui a mesma composição, mantendo layout e organização geral). Aqui, a arte enviada não deve ser utilizada como referência de composição. Ela deve servir apenas para preservar: produto, informações, preços, promoção/oferta, CTA, telefone, endereço, logo e identidade da campanha. Todo o restante deve ser reinventado.

É obrigatório criar uma nova solução visual. Altere significativamente: composição, grid, enquadramento, hierarquia, posição do produto, posição dos textos, posição do preço, relação entre imagem e tipografia, fundo, direção de arte e linguagem gráfica.

A nova arte deve parecer criada por outro diretor de arte, que recebeu exatamente o mesmo briefing mas nunca viu a arte original. Quem comparar as duas artes lado a lado deve perceber imediatamente que são campanhas diferentes para o mesmo produto.

Nunca apenas reorganize pequenos elementos. Nunca apenas troque sombras, cores ou fontes mantendo a mesma composição — isso é o comportamento do modo "melhorar", NÃO deste modo. Se o resultado ficar parecido com uma versão apenas polida da arte original, você falhou.

Regra obrigatória: o prompt final precisa deixar EXPLÍCITO que o modelo não deve usar a arte original como referência de composição. Inclua sempre, adaptado ao contexto, estas frases: "Use the uploaded artwork only as a source of campaign information, not as a layout or composition reference.", "Every other visual aspect must be reinvented — this is not a refinement of the existing design.", "Significantly change the composition, grid, framing, hierarchy, product position, text position, price position, background, art direction and graphic language.", "The new artwork must look like it was created by a different art director for the same product.", "Never just rearrange small elements or swap shadows, colors or fonts alone."

Prompt-base (adapte ao pedido, não copie literalmente): "${PROMPT_BASE_NOVA_VERSAO}"

Se o lojista pedir uma direção específica (mais profissional, mais premium, mais clean, mais chamativa, menos cara de IA, ou deixar a IA decidir), incorpore isso na nova direção criativa — a direção pedida nunca reduz a exigência de recriar a composição inteira do zero.

Antes de finalizar, confira este checklist (corrija o prompt antes de responder se qualquer resposta for "não"): o prompt proíbe usar a arte original como referência de composição? Exige mudança significativa de grid/hierarquia/posições? Deixa claro que é uma campanha nova, não uma evolução da mesma peça? Evita qualquer linguagem de "manter o layout", "preservar a organização" ou "composição visivelmente melhor" (isso é do modo melhorar, não deste)?

A saída deve ser apenas o prompt final em INGLÊS, sem explicações, sem comentários e sem aspas ao redor de tudo.`;

// Gera o prompt final (em INGLÊS — gpt-image-2 segue esse tipo de instrução
// de direção de arte com mais consistência) pro fluxo de transformar uma
// arte existente enviada pelo lojista. modoTransformacao decide o grau de
// liberdade criativa (médio = melhoria recompositiva, alto = nova versão).
export async function montarPromptMelhorarArteExistente(
  req: Pick<ArteExistenteRequest, "modoTransformacao" | "direcao" | "instrucaoUsuario">,
): Promise<PromptGerado> {
  const apiKey = process.env.OPENAI_API_KEY;
  const fallback = fallbackTransformarArteExistente(req);
  if (!apiKey) return { prompt: fallback, usouFallback: true };

  const systemPrompt =
    req.modoTransformacao === "melhoria_recompositiva" ? SYSTEM_MELHORIA_RECOMPOSITIVA : SYSTEM_NOVA_VERSAO_CRIATIVA;

  const openai = new OpenAI({ apiKey, timeout: 25_000 });
  let texto: string | null | undefined;
  try {
    const completion = await criarCompletionComRetry(openai, {
      model: TEXT_PROMPT_BUILDER_MODEL,
      temperature: 0.7,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: descreverPedidoArteExistente(req) },
      ],
    });
    texto = completion.choices[0]?.message?.content?.trim();
  } catch (e) {
    console.error("[prompt-builder] transformar arte existente falhou, usando fallback:", e);
    return { prompt: fallback, usouFallback: true };
  }
  if (!texto) return { prompt: fallback, usouFallback: true };
  const reforcado = reforcarComidaRealista(texto, {
    contexto: `${req.direcao ?? ""} ${req.instrucaoUsuario ?? ""}`,
    fluxo: req.modoTransformacao === "melhoria_recompositiva" ? "melhoria" : "nova_versao",
  });
  return { prompt: reforcado, usouFallback: false };
}
