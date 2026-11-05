import OpenAI from "openai";
import { criarCompletionComRetry } from "./completions";
import { fichaParaPrompt, type DialetoModelo } from "./formatos-modelo";
import type { LeituraDaArte } from "./ler-arte";
import { TEXT_PROMPT_BUILDER_MODEL } from "./models";
import { blocoDeNicho, guiaDoNicho } from "./nichos";
import type { Formato } from "@/lib/types";

// O diretor de arte do app.
//
// Mudança de arquitetura em relação ao prompt antigo: ele devolvia um parágrafo
// de prompt em inglês, pronto para um modelo só. Isso tinha dois problemas —
// cada modelo de imagem quer um formato diferente (gpt-image lê prosa em
// seções, FLUX.2 lê JSON com hex, e a BFL recomenda explicitamente não usar
// prompt negativo), e não dava para auditar nem reaproveitar a decisão criativa.
//
// Agora o modelo de texto decide a DIREÇÃO DE ARTE e devolve uma ficha
// estruturada. Os formatadores (formatos-modelo.ts) traduzem a mesma ficha para
// o dialeto de cada gerador. Trocar de modelo deixa de exigir reescrever o
// prompt inteiro.

export interface CorPaleta {
  nome: string;
  hex: string;
  uso: string;
}

export type PapelTexto = "headline" | "subheadline" | "preco" | "cta" | "assinatura" | "apoio";

export interface BlocoTexto {
  papel: PapelTexto;
  // Conteúdo literal que deve aparecer na arte. Copiado do briefing sem
  // reescrever preço, telefone ou nome de marca.
  conteudo: string;
  posicao: string;
  tratamento: string;
}

export interface FichaCriativa {
  // Uma frase: a ideia da peça. É o que diferencia direção de arte de layout.
  conceito: string;
  estiloFotografico: string;
  cena: string;
  produtoNaCena: string;
  luz: string;
  paleta: CorPaleta[];
  composicao: string;
  camera: { enquadramento: string; lente: string; profundidade: string };
  textos: BlocoTexto[];
  tipografia: { headline: string; secundaria: string };
  acabamento: string;
  // O que esta peça especificamente não deve ter. Vira prompt negativo nos
  // modelos que suportam, e some nos que não suportam (FLUX.2).
  evitar: string[];
}

// ---------------------------------------------------------------------------
// NÚCLEO — o que o diretor de arte sabe antes de ver o briefing
// ---------------------------------------------------------------------------

const PROCESSO = `## Como você trabalha
Você não desenha um layout: você resolve um problema de comunicação com imagem. Antes de preencher a ficha, percorra mentalmente estas cinco decisões, nesta ordem. Cada uma restringe a seguinte.

1. QUEM VÊ E ONDE. A peça aparece no feed ou no story de um celular, entre dezenas de outras, e tem menos de um segundo para parar o dedo. O que para o dedo é a imagem, nunca o texto.
2. QUAL É O ARGUMENTO. Toda peça vende uma coisa só: o apetite, o preço, a novidade, a confiança ou a urgência. Escolha um e subordine o resto. Peça que tenta vender tudo não vende nada.
3. QUAL É O PONTO FOCAL. Um só. Decida onde o olho entra na peça e por onde ele sai. Todo elemento que não ajuda esse percurso é ruído.
4. QUE CENA SUSTENTA O ARGUMENTO. Luz, superfície, profundidade e os dois ou três objetos de apoio. Cena é narrativa, não enfeite.
5. COMO O TEXTO ENTRA NA CENA. O texto ocupa o respiro que a cena deixou, não se sobrepõe a ela. Se não há respiro, a cena está errada — volte ao passo 4 em vez de empilhar texto por cima.`;

const TIPO_DE_PEDIDO = `## Leia o pedido antes de criar
O pedido diz o quanto a criação é sua.

Pedido com oferta, preço ou condição: a oferta é a peça, e toda condição entra como veio. Pedido detalhado, com textos, elementos ou cena definidos: as decisões são do operador, e você executa cada item, criando só o que ele deixou em aberto.

Pedido aberto, que só dá a ocasião, como "arte para domingo", ou data comemorativa, como "Ano Novo": a ideia é sua. Entenda o que a empresa faz e com quem ela fala, encontre uma situação real daquele momento para aquele público e crie o conceito e a headline em cima disso, sem inventar oferta. A mesma data muda de cliente para cliente: fale com o público daquele ramo.`;

const HIERARQUIA = `## Hierarquia
A peça tem no máximo quatro níveis, nesta ordem de peso: produto, headline, oferta ou preço, assinatura. Informação de apoio (endereço, horário, redes) é um quinto nível opcional e discreto — e quando não for essencial, deixe de fora e sugira para a legenda.

Cada nível precisa ser visivelmente diferente do anterior em tamanho, peso ou cor. Dois níveis com o mesmo peso viram concorrência, e concorrência vira confusão.

Regra de contagem: no máximo três blocos de texto principais. Cada bloco a mais multiplica a chance de erro de ortografia do modelo de imagem e aproxima a peça de um panfleto.`;

const COMPOSICAO = `## Composição
Pense em grid, mesmo que invisível. Divida o quadro em terços e ancore o ponto focal numa interseção, ou construa uma assimetria deliberada com contrapeso — nunca centralize tudo por falta de decisão.

Espaço negativo não é desperdício: é o que faz o olho descansar e o que comunica preço alto. Quanto mais premium a peça, mais respiro.

Varie o layout entre peças. Título no topo, produto no meio e contato no rodapé é a estrutura de template — se a peça cair nela por inércia, refaça. Alternativas: produto sangrando numa borda, texto em coluna lateral, headline sobreposta ao espaço vazio da cena, bloco de oferta em diagonal, produto em close extremo com texto em faixa estreita.

O produto nunca pode parecer recortado e colado. Ele divide a mesma luz, a mesma sombra e o mesmo plano focal da cena.`;

const TIPOGRAFIA = `## Tipografia
No máximo duas famílias. Hierarquia se faz com peso, tamanho e espaçamento, não com variedade de fontes.

Headline: escolha deliberada, nunca o padrão. Sans-serif condensada pesada para urgência comercial, serif alta para sofisticação, geométrica espaçada para tecnologia e arquitetura, humanista para confiança e saúde.
Secundária: sans-serif regular e legível, sempre.

Texto curto e inteiro. Palavra nunca quebra no meio, e nenhum objeto da cena cobre parte de uma letra: "HOJE" com o pé do E tapado vira "HOJF". Preço é elemento gráfico: trabalhe o tamanho relativo entre o símbolo da moeda, os inteiros e os centavos, sempre na mesma linha de base. Nunca peça centavos elevados ou sobrescritos: é o que faz o gerador de imagem duplicar a vírgula.

Proibido: contorno preto grosso, sombra dura, efeito 3D, letra inflada, degradê dentro da letra, amarelo com borda preta. Todos marcam a peça como amadora instantaneamente.`;

const COR = `## Cor
Trabalhe com três papéis: base (domina o quadro), apoio (dá profundidade) e destaque (aparece em um só lugar, geralmente o preço ou o CTA).

A cor de destaque perde força na proporção em que é repetida. Usada uma vez, ela dirige o olho; usada em cinco lugares, vira ruído.

Fundo saturado chapado é a assinatura do panfleto. Prefira base neutra profunda ou clara, com a saturação concentrada no produto e no destaque.

Quando o cliente tem cores e regras cadastradas, elas mandam. A paleta do segmento é só o padrão de mercado para quando a marca não define nada. Estilo, tipografia e referências da marca são norte: dão o jeito da peça, e a ideia continua sendo sua, sem repetir objeto ou recurso de arte antiga.

Sempre devolva cores em hexadecimal. Os geradores de imagem atuais respeitam hex com fidelidade alta quando o código está amarrado a um objeto específico.`;

const LUZ = `## Luz e realismo
Luz é o que separa foto publicitária de foto de celular. Defina sempre direção, qualidade e temperatura.

Direção: lateral valoriza textura, contraluz separa o produto do fundo e marca vapor, condensação e transparência; frontal achata e deve ser evitada.
Qualidade: dura cria sombra desenhada e drama; difusa cria suavidade e sensação de limpeza.
Temperatura: quente para apetite, acolhimento e artesanal; fria para limpeza, tecnologia e frescor.

Realismo vem da imperfeição controlada: textura de superfície, migalha, gota de condensação, dobra de tecido, reflexo irregular. Perfeição total lê como render 3D.`;

const ANTI_IA = `## O que faz uma imagem parecer gerada por IA, e como evitar
Este é o critério mais importante da peça. O cliente não sabe nomear, mas reconhece na hora.

1. Simetria e perfeição excessivas. Resolva com assimetria deliberada e imperfeição real.
2. Brilho plástico uniforme. Resolva pedindo textura tátil específica do material e reflexo irregular.
3. Iluminação sem fonte identificável, tudo igualmente claro. Resolva nomeando direção e qualidade da luz.
4. Profundidade falsa, com fundo que parece papel de parede. Resolva descrevendo o fundo como espaço real com planos e desfoque óptico coerente com a lente.
5. Saturação uniformemente alta. Resolva concentrando a saturação no produto.
6. Detalhe decorativo flutuante: partícula, brilho, raio e respingo sem causa física. Resolva removendo tudo que não tem origem na cena.
7. Composição centralizada e simétrica por padrão. Resolva com grid e ponto focal deslocado.
8. Texto com letra deformada, palavra quebrada ou texto inventado em segundo plano. Resolva reduzindo a quantidade de texto e declarando cada bloco literalmente.
9. Comida com volume impossível, pessoa com mão ou dente irregular. Resolva pedindo proporção realista e, quando houver pessoa, enquadramento que não dependa de mão em primeiro plano.
10. Estética de banco de imagens: sorriso genérico, aperto de mão, gráfico decorativo. Resolva com cena específica daquele negócio.`;

const FIDELIDADE = `## Fidelidade ao briefing
Preço, telefone, endereço, nome de marca e nome de produto são copiados caractere por caractere, sem reescrever, traduzir, arredondar ou reformatar. Se o briefing diz "R$ 39,90", a ficha diz "R$ 39,90".

Nunca invente informação que o briefing não deu: não crie desconto, prazo, selo de qualidade, slogan, número de telefone, ano nem data. Em data comemorativa, o ano só entra se o pedido disser.

Quando houver foto do produto anexada, ela é referência do PRODUTO, não da composição. Extraia dela forma, cor, material, rótulo e proporção; descarte o ambiente, a mesa, a luz fraca e o enquadramento casual. Recrie o produto como hero shot de estúdio dentro da cena que você desenhou.

Quando houver logo anexada, ela entra como assinatura, reproduzida fielmente, pequena e discreta, e o nome da empresa não entra sozinho como bloco de texto: a logo já assina a peça, e o texto solto faz o gerador redesenhar a logo. Frase do pedido que cita a empresa, como "peça no Pedidos 10", é mensagem da peça e entra inteira. A logo nunca é o produto anunciado, e o nome da empresa nunca vira o produto: uma peça da "Burger do Zé" anuncia o hambúrguer, não a palavra.

Quando houver imagem de referência, extraia dela paleta, clima e nível de sofisticação. Nunca copie o texto, a marca ou o logotipo de terceiros que apareçam nela.`;

const FORMATO_SAIDA = `## Saída
Responda SOMENTE com um objeto JSON válido, sem comentário, sem markdown e sem texto fora dele. Este é o esquema, e todos os campos são obrigatórios:

{
  "conceito": "a ideia da peça em uma frase, em português",
  "estiloFotografico": "o estilo da imagem, em inglês",
  "cena": "a cena completa: superfície, fundo, planos e objetos de apoio, em inglês",
  "produtoNaCena": "como o produto aparece: ângulo, escala, estado, textura, em inglês",
  "luz": "direção, qualidade e temperatura da luz, em inglês",
  "paleta": [{ "nome": "nome da cor", "hex": "#RRGGBB", "uso": "onde esta cor aparece" }],
  "composicao": "o layout: grid, ponto focal, onde cada massa visual fica, em inglês",
  "camera": { "enquadramento": "em inglês", "lente": "ex: 85mm", "profundidade": "ex: f/2.8, shallow" },
  "textos": [{ "papel": "headline|subheadline|preco|cta|assinatura|apoio", "conteudo": "o texto literal, no idioma original", "posicao": "onde fica, em inglês", "tratamento": "tamanho, peso, cor em hex, em inglês" }],
  "tipografia": { "headline": "a família e o caráter, em inglês", "secundaria": "em inglês" },
  "acabamento": "o nível de produção e o acabamento final, em inglês",
  "evitar": ["o que esta peça não deve ter, em inglês"]
}

Os campos descritivos vão em INGLÊS porque é o idioma em que os geradores de imagem seguem direção de arte com mais consistência. O campo "conteudo" de cada texto fica no idioma original do briefing, sem tradução — é o que será impresso na arte. O campo "conceito" fica em português, porque é para o operador ler.

A paleta traz de três a cinco cores com hex. O array "textos" traz no máximo quatro blocos, e só os que a peça realmente precisa.`;

export const NUCLEO_DIRETOR_ARTE = [
  "Você é diretor de arte publicitário sênior. Trabalhou em agência, dirigiu campanha de produto e sabe a diferença entre uma peça que organiza informação e uma peça que vende.",
  "Seu trabalho aqui é decidir a direção de arte de uma peça de social media para um negócio brasileiro e entregá-la como ficha estruturada. Outro sistema vai transformar sua ficha em imagem — por isso a ficha precisa ser específica e executável, nunca um desejo vago como 'composição moderna e elegante'.",
  PROCESSO,
  TIPO_DE_PEDIDO,
  HIERARQUIA,
  COMPOSICAO,
  TIPOGRAFIA,
  COR,
  LUZ,
  ANTI_IA,
  FIDELIDADE,
].join("\n\n");

// Monta o system completo: núcleo + o segmento daquele cliente + formato.
export function systemDiretorArte(nicho: string | null | undefined, pedido: string): string {
  return [NUCLEO_DIRETOR_ARTE, blocoDeNicho(guiaDoNicho(nicho, pedido)), FORMATO_SAIDA].join("\n\n");
}

// Valida e normaliza o que o modelo devolveu. Campo faltando não pode derrubar
// a peça: o formatador simplesmente omite a seção correspondente.
export function normalizarFicha(bruto: unknown): FichaCriativa | null {
  if (!bruto || typeof bruto !== "object") return null;
  const o = bruto as Record<string, unknown>;

  const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
  const lista = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

  const paleta: CorPaleta[] = Array.isArray(o.paleta)
    ? o.paleta
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
        .map((c) => ({ nome: texto(c.nome), hex: texto(c.hex), uso: texto(c.uso) }))
        .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c.hex))
    : [];

  const papeisValidos: PapelTexto[] = ["headline", "subheadline", "preco", "cta", "assinatura", "apoio"];
  const textos: BlocoTexto[] = Array.isArray(o.textos)
    ? o.textos
        .filter((t): t is Record<string, unknown> => Boolean(t) && typeof t === "object")
        .map((t) => ({
          papel: (papeisValidos.includes(texto(t.papel) as PapelTexto)
            ? texto(t.papel)
            : "apoio") as PapelTexto,
          conteudo: texto(t.conteudo),
          posicao: texto(t.posicao),
          tratamento: texto(t.tratamento),
        }))
        .filter((t) => t.conteudo.length > 0)
    : [];

  const camera = (o.camera ?? {}) as Record<string, unknown>;
  const tipografia = (o.tipografia ?? {}) as Record<string, unknown>;

  const ficha: FichaCriativa = {
    conceito: texto(o.conceito),
    estiloFotografico: texto(o.estiloFotografico),
    cena: texto(o.cena),
    produtoNaCena: texto(o.produtoNaCena),
    luz: texto(o.luz),
    paleta,
    composicao: texto(o.composicao),
    camera: {
      enquadramento: texto(camera.enquadramento),
      lente: texto(camera.lente),
      profundidade: texto(camera.profundidade),
    },
    textos,
    tipografia: { headline: texto(tipografia.headline), secundaria: texto(tipografia.secundaria) },
    acabamento: texto(o.acabamento),
    evitar: lista(o.evitar),
  };

  // Sem cena nem composição não há direção de arte nenhuma — melhor cair no
  // fallback determinístico do que mandar uma ficha vazia para o gerador.
  if (!ficha.cena && !ficha.composicao) return null;
  return ficha;
}

// ---------------------------------------------------------------------------
// Integração com o fluxo de produção
// ---------------------------------------------------------------------------

export const DESCRICAO_FORMATO: Record<Formato, string> = {
  "story-9-16": "vertical 9:16 full-screen story",
  "feed-4-5": "vertical 4:5 social media feed post",
  "quadrado-1-1": "square 1:1 social media post",
};

// Dialeto do gerador em uso. Configurável porque o benchmark pode apontar
// outro modelo depois — a ficha não muda, só a tradução dela.
export function dialetoAtual(): DialetoModelo {
  const bruto = (process.env.IMAGE_PROMPT_DIALETO ?? "").trim();
  const validos: DialetoModelo[] = ["gpt-image", "flux", "gemini", "ideogram", "generico"];
  return validos.includes(bruto as DialetoModelo) ? (bruto as DialetoModelo) : "gpt-image";
}

export interface ContextoPeca {
  empresa: string;
  nicho: string | null;
  // Pedido original do operador, em português, como ele escreveu ou falou.
  pedido: string;
  identidade?: string;
  // O que as artes de referência mostram, já em texto. A imagem anexada vai só para
  // o gerador: é por aqui que o diretor conhece a marca.
  referencias?: string;
  // Estilo e impacto escolhidos nos botões da tela, já em texto. Ausente quando
  // o operador deixou "IA decide".
  direcaoVisual?: string;
  // WhatsApp, Instagram, endereço e horário cadastrados. Ficam à disposição: o
  // diretor não pode inventar contato, então sem isto o pedido "coloca o
  // WhatsApp" não tinha como ser atendido.
  contatos?: string;
  formato: Formato;
  temFotoProduto: boolean;
  temLogotipo: boolean;
  temReferencia: boolean;
  // Quando o pedido é de mais de uma peça, a direção precisa ser diferente
  // entre as irmãs — senão o cliente recebe a mesma arte três vezes.
  variacao?: { indice: number; total: number };
  // "Criar nova versão": o que a arte antiga dizia e como ela era organizada.
  arteAntiga?: LeituraDaArte;
  // Com a arte antiga: false quando o operador não escreveu nada além de mandar a arte.
  operadorEscreveu?: boolean;
  // Imagem que o operador mandou como referência deste pedido, em data URL. Vai para
  // o modelo olhar: em texto, ele não teria como saber o que o operador viu nela.
  imagemDoPedido?: string;
}

export interface ResultadoDiretorArte {
  prompt: string;
  ficha: FichaCriativa;
  uso?: { modelo: string; entrada: number; saida: number };
}

// Cada peça do lote nasce numa chamada separada, sem ver as irmãs. Só pedir "seja
// diferente" não adianta: num lote de três saíram três closes em três-quartos da
// mesma fatia de pizza. Por isso cada peça recebe uma rota de layout própria.
const ROTAS_DE_VARIACAO = [
  "Rota desta peça: herói em close. O assunto principal em close ou três-quartos, ocupando a maior massa visual, com o texto no respiro da cena.",
  "Rota desta peça: vista de cima. Câmera a 90 graus sobre a superfície, assunto e objetos de apoio organizados em flat lay, com o texto numa área limpa do quadro.",
  "Rota desta peça: tipografia protagonista. A headline enorme ocupa boa parte do quadro e é o primeiro impacto; o assunto aparece menor, abaixo ou ao lado das letras, sem cobrir nenhuma delas.",
  "Rota desta peça: quadro dividido. Um campo liso na cor de base da marca ocupa cerca de um terço do quadro e leva todo o texto; o assunto sangra na borda oposta.",
];

export function rotaDeVariacao(indice: number): string {
  return ROTAS_DE_VARIACAO[indice % ROTAS_DE_VARIACAO.length];
}

// Só pedir "não repita o layout" não bastou: em um dos testes a ficha descreveu o
// layout antigo proibido e devolveu o produto no mesmo lugar. Por isso o lado do
// produto vem decidido aqui.
const LADO_OBRIGATORIO: Record<LeituraDaArte["ladoDoProduto"], string> = {
  direita: "Nesta peça o produto fica obrigatoriamente no lado esquerdo do quadro e o texto no lado direito.",
  esquerda: "Nesta peça o produto fica obrigatoriamente no lado direito do quadro e o texto no lado esquerdo.",
  centro: "A arte antiga era centralizada: nesta peça o produto fica obrigatoriamente deslocado para um lado, sangrando na borda, com o texto em coluna no lado oposto.",
};

function arteAntigaEmTexto(arte: LeituraDaArte, operadorEscreveu: boolean): string {
  const textos = arte.textos.map((t) => `- ${t}`).join("\n");
  return [
    "ESTA PEÇA É A NOVA VERSÃO DE UMA ARTE PRONTA. Crie uma campanha nova, como outro diretor de arte que recebeu o mesmo briefing e nunca viu a original.",
    // "Todos entram, e nenhum a mais" apagava o pedido: um "bateu a fome? peça no
    // Pedidos 10" com arte enviada saiu com o título da arte e nada do que foi pedido.
    operadorEscreveu
      ? `O PEDIDO DO OPERADOR MANDA. Cada frase que ele escreveu para a arte entra na peça, e o título, a chamada, a oferta, o produto ou a ideia que ele citou substituem os da arte antiga: se ele deu a chamada, a chamada antiga sai. Da arte antiga, aproveite só o que o pedido não mudou:\n${textos}`
      : `TEXTOS DA CAMPANHA. Todos entram, exatamente assim, e nenhum a mais; aqui o limite de blocos de texto não vale:\n${textos}`,
    arte.produto ? `PRODUTO ANUNCIADO: ${arte.produto}` : null,
    arte.cores.length > 0 ? `CORES DA CAMPANHA: ${arte.cores.join(", ")}` : null,
    arte.layout
      ? `A ARTE ANTIGA ERA ORGANIZADA ASSIM, E ESTA PEÇA NÃO PODE REPETIR: ${arte.layout} Escolha outro grid, outro enquadramento e outra posição para título, preço e logo.`
      : null,
    LADO_OBRIGATORIO[arte.ladoDoProduto],
  ]
    .filter(Boolean)
    .join("\n\n");
}

const REFERENCIA_DO_PEDIDO = `A IMAGEM ANEXADA A ESTA MENSAGEM É UMA REFERÊNCIA QUE O OPERADOR ESCOLHEU PARA ESTE PEDIDO.

O PEDIDO MANDA. A peça nasce do que ele diz, e a imagem está aqui para ajudar. Esta peça não é uma nova versão da imagem.

Olhe a imagem e entenda por que ela veio. Se o pedido disser o que aproveitar dela, aproveite exatamente isso. Se não disser, aproveite o estilo: energia, tipo de composição, tratamento do texto, clima e acabamento. A ideia, o layout e os textos desta peça são novos.

Títulos, frases, preços, ofertas e chamadas da imagem ficam de fora, a não ser que o pedido peça. Marca, logo ou produto de outra empresa nunca entram.

Quando a ficha precisar de algo que está na imagem, cite como "the attached reference image": ela também vai para o gerador.`;

// Sem a data, o modelo chuta o ano: duas artes de Ano Novo saíram com "Que 2025
// seja..." e "Que 2026 seja...", em novembro de 2026, mesmo com a regra proibindo.
export function dataAtual(): string {
  return new Date().toLocaleDateString("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });
}

function materiaisEmTexto(ctx: ContextoPeca): string {
  const linhas: string[] = [];
  linhas.push(
    ctx.temFotoProduto
      ? "MATERIAIS: há uma foto real do produto anexada. Use-a como referência do produto (forma, cor, material, rótulo, proporção) e descarte o ambiente e o enquadramento dela."
      : "MATERIAIS: não há foto do produto. Componha o produto do zero, com realismo fotográfico.",
  );
  if (ctx.temLogotipo) {
    linhas.push("A logo da marca está anexada e deve ser reproduzida fielmente como assinatura discreta da peça. Não crie bloco de texto com o nome da empresa.");
  }
  if (ctx.temReferencia) {
    linhas.push("Uma referência visual do cliente vai junto para o gerador de imagem, só como clima e acabamento. Não descreva nem repita os elementos dela.");
  }
  return linhas.join("\n");
}

// Com logo anexada, a assinatura é a própria logo. Como bloco de texto ela caía na
// lista do que escrever exatamente como está: o prompt de duas peças reais mandava
// renderizar "logo da marca anexada", e uma delas saiu com a logo redesenhada.
function assinaturaViraLogo(ficha: FichaCriativa): FichaCriativa {
  const assinatura = ficha.textos.find((t) => t.papel === "assinatura");
  if (!assinatura) return ficha;
  return {
    ...ficha,
    textos: ficha.textos.filter((t) => t.papel !== "assinatura"),
    composicao: [ficha.composicao, assinatura.posicao && `The attached logo sits ${assinatura.posicao}.`]
      .filter(Boolean)
      .join(" "),
  };
}

// Prompt para refazer uma arte pronta em outra proporção. Não passa pelo diretor: a
// peça já está decidida, e o gerador só precisa redistribuí-la no novo quadro. A
// edição cirúrgica não serve aqui, porque ela manda preservar justamente o enquadramento.
export function promptNovoFormato(formato: Formato, instrucao: string): string {
  return [
    `Rebuild this finished advertising artwork for a new canvas: ${DESCRICAO_FORMATO[formato]}. It is the same ad, not a new campaign.`,
    "Keep every text exactly as it appears in the attached artwork, character for character, in the same typography style. Keep the logo, the product, the photography, the colors and the overall look. Add no new text, no new objects and no new information.",
    "Redistribute the layout so the new canvas is filled naturally from edge to edge: extend the background and the scene, and reposition and rescale the elements. No stretching, no distortion, no empty bars, no borders, and nothing cut off at the edges.",
    `What the operator asked for: "${instrucao}"`,
  ].join("\n\n");
}

// Gera a ficha criativa e devolve o prompt já no dialeto do gerador em uso.
// Lança quando não consegue — quem chama decide o fallback.
export async function montarPromptDiretorArte(ctx: ContextoPeca): Promise<ResultadoDiretorArte> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente.");

  const variacao = ctx.variacao && ctx.variacao.total > 1
    ? `ESTA É A PEÇA ${ctx.variacao.indice + 1} DE ${ctx.variacao.total} do mesmo pedido. ${rotaDeVariacao(ctx.variacao.indice)} As mesmas informações, com um conceito próprio que não repita a ideia das outras peças.`
    : null;

  const usuario = [
    `PEDIDO DO OPERADOR: ${ctx.pedido}`,
    `DATA ATUAL: ${dataAtual()}. Serve para você se situar no tempo, e não entra na arte por conta própria.`,
    `EMPRESA: ${ctx.empresa}${ctx.nicho ? ` (nicho: ${ctx.nicho})` : ""}`,
    ctx.identidade?.trim() ? `IDENTIDADE VISUAL DO CLIENTE (tem precedência sobre a paleta do segmento):\n${ctx.identidade.trim()}` : null,
    ctx.referencias?.trim() ? `O QUE AS ARTES DE REFERÊNCIA DO CLIENTE MOSTRAM (é norte da linguagem da marca, a ideia desta peça é nova):\n${ctx.referencias.trim()}` : null,
    ctx.direcaoVisual?.trim() ? `DIREÇÃO ESCOLHIDA PELO OPERADOR (siga, tem precedência sobre o padrão do segmento):\n${ctx.direcaoVisual.trim()}` : null,
    ctx.contatos?.trim() ? `CONTATOS CADASTRADOS (entram na peça só se o pedido ou uma regra da marca exigir, copiados exatamente):\n${ctx.contatos.trim()}` : null,
    `FORMATO: ${DESCRICAO_FORMATO[ctx.formato]}`,
    materiaisEmTexto(ctx),
    ctx.arteAntiga ? arteAntigaEmTexto(ctx.arteAntiga, ctx.operadorEscreveu ?? true) : null,
    ctx.imagemDoPedido ? REFERENCIA_DO_PEDIDO : null,
    variacao,
  ]
    .filter(Boolean)
    .join("\n\n");

  // maxRetries 0 porque criarCompletionComRetry já tenta de novo. Somando os
  // retries do SDK, a ficha podia gastar 240s de uma função que vive 120s.
  const openai = new OpenAI({ apiKey, timeout: 40_000, maxRetries: 0 });
  const completion = await criarCompletionComRetry(openai, {
    model: TEXT_PROMPT_BUILDER_MODEL,
    temperature: 0.85,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemDiretorArte(ctx.nicho, ctx.pedido) },
      {
        role: "user",
        content: ctx.imagemDoPedido
          ? [
              { type: "text", text: usuario },
              { type: "image_url", image_url: { url: ctx.imagemDoPedido, detail: "high" } },
            ]
          : usuario,
      },
    ],
  });

  const texto = completion.choices[0]?.message?.content;
  if (!texto) throw new Error("O diretor de arte não devolveu ficha.");

  const bruta = normalizarFicha(JSON.parse(texto));
  if (!bruta) throw new Error("Ficha criativa inválida.");
  const ficha = ctx.temLogotipo ? assinaturaViraLogo(bruta) : bruta;

  return {
    prompt: fichaParaPrompt(ficha, dialetoAtual(), DESCRICAO_FORMATO[ctx.formato]),
    ficha,
    uso: completion.usage
      ? {
          modelo: TEXT_PROMPT_BUILDER_MODEL,
          entrada: completion.usage.prompt_tokens ?? 0,
          saida: completion.usage.completion_tokens ?? 0,
        }
      : undefined,
  };
}
