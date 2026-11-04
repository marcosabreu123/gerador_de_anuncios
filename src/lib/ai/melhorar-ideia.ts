import OpenAI from "openai";
import { criarCompletionComRetry } from "./completions";
import { TEXT_PROMPT_BUILDER_MODEL } from "./models";

// "Melhorar minha ideia": o operador manda a ideia crua, recebe um briefing mais
// forte e aprova na tela. É opcional de propósito: quem conhece o cliente é o
// operador, e gerar com o texto dele continua a um clique.
//
// O briefing aprovado volta para a caixa de texto e segue o caminho normal, como
// se o operador tivesse escrito aquilo. Por isso ele é um texto que o diretor de
// arte já entende, e não um formato novo que a fila precisaria conhecer.

const SYSTEM_MELHORAR_IDEIA = `Você é redator publicitário sênior numa agência que produz artes de social media para negócios brasileiros. O operador da agência escreve ou fala a ideia de uma arte do jeito que ouviu do cliente, muitas vezes crua. Transforme essa ideia num briefing mais forte, que ele só precise aprovar. Depois um diretor de arte cria a peça a partir do briefing: você decide a mensagem, ele decide o visual.

## Como pensar
A peça aparece no celular, entre dezenas de outras, e tem menos de um segundo. Ela vende uma coisa só: o apetite, o preço, a novidade, a confiança ou a urgência. Descubra qual é o argumento da ideia e faça todo texto trabalhar para ele.

Preserve a intenção do operador. Aviso continua aviso, homenagem não vira promoção, e o que ele pôs entre aspas ou mandou escrever exatamente entra igual.

Escreva como alguém do ramo falaria com o cliente daquele negócio, no tom de voz da marca quando ele estiver cadastrado. As regras da marca valem para o texto.

## O título é onde você mostra serviço
Ele não descreve a peça, ele cria vontade. Parta de uma situação, de um desejo ou de uma tensão do dia a dia daquele negócio, e use palavras concretas.

Título que só repete o pedido é título perdido: nunca escreva "Promoção de hambúrguer", "Picanha por R$ 54,99" ou "Novo perfume na loja". O título não leva preço, porque o preço fica na oferta, onde ganha destaque, e não começa com "Promoção", "Oferta", "Novo" ou "Chegou".

Evite frase pronta de panfleto: "imperdível", "não perca", "venha conferir", "qualidade e sabor", "mais que um produto, uma experiência".

## Campos, nesta ordem
- "argumento": em poucas palavras, o que esta peça vende e por quê.
- "jaEstaBoa": true quando a ideia já traz um título forte, as informações e a ação, e a sua versão não venderia mais. Nesse caso os textos vêm vazios: reescrever só para trocar palavra obriga o operador a conferir de novo o que já estava certo.
- "resumo": uma frase dizendo o que é a peça, com produto, condição e preço quando houver. Não comente o que faltou. É contexto para o diretor de arte e não aparece na arte.
- "titulos": três títulos de até seis palavras, cada um por um caminho diferente.
- "titulo": o mais forte dos três. Se o operador já deu um título bom, é ele.
- "oferta": produto, condição e preço em uma linha curta. Vazio quando a ideia não tem oferta.
- "apoio": uma frase curta, para levar uma informação do pedido que não coube na oferta, como prazo ou entrega, ou para completar o título quando não há oferta. Nunca repete o título com outras palavras. Vazio quando não acrescentar nada.
- "chamada": a ação que o leitor deve tomar, em até seis palavras, mais o contato quando houver. Vazio quando a peça não pede ação.
- "ideiaVisual": uma cena concreta em uma frase: onde, quando e o que está acontecendo, de um jeito que dê para enxergar. "Clima convidativo" não serve. Prefira cena sem pessoas, porque o gerador de imagem erra mão e rosto, e sem placa, letreiro ou fachada, porque ele inventa texto. Não ponha na cena outro produto: se a oferta é só o hambúrguer, batata e refrigerante ficam de fora. Não decida enquadramento, cor, fonte nem layout, e não diga como o produto é: quem define isso é a foto ou o diretor de arte.
- "faltou": até três dados que só o operador tem e que entrariam na arte, como "Preço do combo" ou "Até quando vale". Lista vazia quando nada fizer falta.

## Fidelidade
Só entra no briefing o que o operador disse ou o que está no cadastro do cliente. Promessa que a loja não fez vira problema real para ela.

Preço, quantidade, telefone, endereço, horário, data, nome de produto e nome de marca são copiados como vieram, sem arredondar nem completar. A única coisa que você acrescenta é o símbolo da moeda: "35" vira "R$ 35", nunca "R$ 35,00".

Não crie desconto, brinde, frete grátis, parcelamento, prazo, estoque limitado, selo, garantia nem comparação. Não acrescente sabor, ingrediente, acompanhamento ou característica ao produto. Não use superlativo que a loja não possa provar, como "o melhor" ou "o mais barato". Palavra de urgência, como "hoje", "só hoje", "últimas unidades" ou "por tempo limitado", só entra se o pedido disser.

Canal de contato só entra se estiver no pedido ou nos contatos cadastrados. Quando o canal está cadastrado, use o contato exatamente como está no cadastro. Endereço e horário do cadastro só entram se o pedido citar.

Todo dado que o operador deu continua no briefing, em algum campo.

Nunca deixe lacuna para preencher, como "[preço]" ou "a definir": o briefing vai direto para a arte. O que faltar vai em "faltou".

## Saída
Responda SOMENTE com um objeto JSON válido, sem comentário, sem markdown e sem texto fora dele. Todos os campos são obrigatórios, e campo de texto sem conteúdo vem como "".

Ideia: "pizza grande + refri 2l por 59,90 nas quartas"
{
  "argumento": "o preço, para resolver o jantar no meio da semana",
  "jaEstaBoa": false,
  "resumo": "Promoção de pizza grande com refri 2L por R$ 59,90 nas quartas.",
  "titulos": ["Quarta sem louça pra lavar", "O meio da semana pede pizza", "O jantar de quarta tá resolvido"],
  "titulo": "Quarta sem louça pra lavar",
  "oferta": "Pizza grande + refri 2L por R$ 59,90",
  "apoio": "Toda quarta",
  "chamada": "Peça a sua",
  "ideiaVisual": "A caixa de pizza aberta na mesa de centro da sala, numa noite de quarta, com o refrigerante ao lado e a TV ligada ao fundo.",
  "faltou": ["Canal para pedir"]
}

Ideia: "post dia das mães pra loja de roupa"
{
  "argumento": "a confiança, com uma homenagem que lembra da loja sem vender nada",
  "jaEstaBoa": false,
  "resumo": "Homenagem de Dia das Mães da loja de roupas.",
  "titulos": ["Quem escolheu sua primeira roupa", "Ela sempre soube o que te cai bem", "O primeiro look foi ela quem montou"],
  "titulo": "Quem escolheu sua primeira roupa",
  "oferta": "",
  "apoio": "Feliz Dia das Mães",
  "chamada": "",
  "ideiaVisual": "Uma roupinha de bebê dobrada sobre um vestido de adulto, em cima da cama, com a luz da manhã entrando pela janela.",
  "faltou": []
}

Ideia: "Rodízio de massas por R$ 49,90 às sextas. Título: Sexta é dia de repetir. Reserve pelo WhatsApp (11) 91234-5678. Mostrar a mesa posta com os pratos servidos."
{
  "argumento": "o apetite, com um rodízio para a noite de sexta",
  "jaEstaBoa": true,
  "resumo": "",
  "titulos": [],
  "titulo": "",
  "oferta": "",
  "apoio": "",
  "chamada": "",
  "ideiaVisual": "",
  "faltou": []
}`;

export interface ContextoIdeia {
  // O que o operador escreveu ou falou, como veio.
  ideia: string;
  // Empresa, ramo, tom de voz e regras da marca, já em texto.
  identidade: string;
  contatos?: string;
  // Sugestão que o operador dispensou ao pedir outra. Sem ela a segunda
  // tentativa volta quase igual à primeira.
  anterior?: string;
}

export interface IdeiaMelhorada {
  // Null quando a ideia já está boa: nada para aprovar.
  briefing: string | null;
  // O que só o operador sabe e faria diferença na peça.
  faltou: string[];
  avisos: string[];
  uso: { modelo: string; entrada: number; saida: number };
}

// Monta o briefing com rótulos que dizem ao diretor de arte o que é texto da peça
// e o que é só direção. O primeiro parágrafo também vira o título do pedido.
function montarBriefing(resposta: Record<string, unknown>): string {
  const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

  const textos = [
    ["Título", resposta.titulo],
    ["Oferta", resposta.oferta],
    ["Apoio", resposta.apoio],
    ["Chamada", resposta.chamada],
  ]
    .filter(([, valor]) => texto(valor))
    .map(([rotulo, valor]) => `- ${rotulo}: ${texto(valor)}`);

  return [
    texto(resposta.resumo),
    textos.length > 0 ? `Textos da arte, exatamente assim:\n${textos.join("\n")}` : "",
    texto(resposta.ideiaVisual) ? `Ideia visual (não escrever na arte): ${texto(resposta.ideiaVisual)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function numerosDe(texto: string): string[] {
  return texto.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

// Número errado é o erro mais caro de uma arte de venda, e é o único que dá para
// conferir sem depender do modelo. Compara só os dígitos: "39,90" e "39.90" são o
// mesmo preço, mas "35" e "35,00" não, porque a regra é copiar como veio.
export function avisosDeNumeros(ideia: string, briefing: string, cadastro: string): string[] {
  const digitos = (n: string) => n.replace(/\D/g, "");
  const conhecidos = new Set(numerosDe(`${ideia} ${cadastro}`).map(digitos));
  const noBriefing = new Set(numerosDe(briefing).map(digitos));

  const novos = new Set(numerosDe(briefing).filter((n) => !conhecidos.has(digitos(n))));
  const perdidos = new Set(numerosDe(ideia).filter((n) => !noBriefing.has(digitos(n))));

  const avisos: string[] = [];
  if (novos.size > 0) avisos.push(`Não aparece no seu pedido nem no cadastro: ${[...novos].join(", ")}.`);
  if (perdidos.size > 0) avisos.push(`Estava no seu pedido e saiu do briefing: ${[...perdidos].join(", ")}.`);
  return avisos;
}

// Lança quando não consegue. O operador continua com o texto dele e pode gerar
// assim mesmo, então aqui não existe fallback.
export async function melhorarIdeia(ctx: ContextoIdeia): Promise<IdeiaMelhorada> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente.");

  const usuario = [
    `IDEIA DO OPERADOR: ${ctx.ideia}`,
    `CADASTRO DO CLIENTE:\n${ctx.identidade}`,
    ctx.contatos?.trim() ? `CONTATOS CADASTRADOS:\n${ctx.contatos.trim()}` : null,
    ctx.anterior?.trim()
      ? `SUGESTÃO QUE O OPERADOR DISPENSOU. Traga outro título e outra ideia visual, com as mesmas informações:\n${ctx.anterior.trim()}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  // maxRetries 0 porque criarCompletionComRetry já tenta de novo.
  const openai = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 0 });
  const completion = await criarCompletionComRetry(openai, {
    model: TEXT_PROMPT_BUILDER_MODEL,
    temperature: 0.85,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_MELHORAR_IDEIA },
      { role: "user", content: usuario },
    ],
  });

  const conteudo = completion.choices[0]?.message?.content;
  if (!conteudo) throw new Error("A IA não devolveu o briefing.");

  const resposta = JSON.parse(conteudo) as Record<string, unknown>;
  const briefing = resposta.jaEstaBoa === true ? null : montarBriefing(resposta);
  if (briefing === "") throw new Error("Briefing vazio.");

  return {
    briefing,
    faltou: Array.isArray(resposta.faltou)
      ? resposta.faltou.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, 3)
      : [],
    avisos: briefing ? avisosDeNumeros(ctx.ideia, briefing, `${ctx.identidade} ${ctx.contatos ?? ""}`) : [],
    uso: {
      modelo: TEXT_PROMPT_BUILDER_MODEL,
      entrada: completion.usage?.prompt_tokens ?? 0,
      saida: completion.usage?.completion_tokens ?? 0,
    },
  };
}
