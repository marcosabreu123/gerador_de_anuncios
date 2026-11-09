// Biblioteca de direção de arte por nicho.
//
// Por que existe: o prompt antigo tinha 993 linhas de prosa com regra detalhada
// só para açougue e perfume — todo o resto caía num texto genérico, e peça
// genérica é o que faz o cliente achar que "parece IA". Aqui cada segmento traz
// o que um diretor de arte já sabe antes de abrir o arquivo: que paleta aquele
// mercado usa, que luz valoriza aquele produto, o que entra em cena, como o
// público lê a peça e qual é o erro clássico do segmento.
//
// Só o nicho do cliente entra no prompt. Mandar os vinte gastaria contexto e
// diluiria a direção.

export interface GuiaNicho {
  // Nome legível, usado no prompt.
  rotulo: string;
  // Termos que aparecem no campo "nicho" do cadastro ou no próprio pedido.
  termos: string[];
  // Paleta típica do segmento quando a marca não impõe a dela.
  paleta: string;
  // Luz que valoriza o produto. É o que mais separa foto publicitária de foto de celular.
  luz: string;
  // O que pode aparecer em cena além do produto.
  cena: string;
  // Como o olho percorre a peça nesse mercado.
  composicao: string;
  // Linguagem tipográfica coerente com o segmento.
  tipografia: string;
  // O erro clássico do nicho — o que faz a peça parecer amadora.
  evitar: string;
  // Referência de qualidade: com o que a peça deve se parecer.
  referencia: string;
}

export const NICHOS: Record<string, GuiaNicho> = {
  hamburgueria: {
    rotulo: "hamburgueria, lanchonete e fast-food artesanal",
    termos: ["hamburgueria", "hamburger", "hamburguer", "burger", "lanchonete", "lanche", "fast-food", "fast food", "hot dog", "dogueria", "batata"],
    paleta: "madeira escura, carvão, preto fosco, creme, âmbar e um destaque quente saturado usado só no preço ou selo",
    luz: "luz lateral quente e direcional, contraluz marcando o vapor e o brilho do pão; sombra densa mas com detalhe",
    cena: "tábua de madeira ou prato escuro, papel kraft, fritas soltas, gotas de molho, grão de sal, fundo com profundidade desfocada do balcão ou da chapa",
    composicao: "hero shot em close ou três-quartos, produto ocupando a maior massa visual, headline curta no respiro superior, preço em selo integrado",
    tipografia: "sans-serif condensada e pesada na headline, sans-serif regular no secundário; nada de script",
    evitar: "fundo vermelho e amarelo saturado de panfleto, queijo em cor fluorescente, hambúrguer com camadas impossíveis de altura, brilho plástico de render 3D",
    referencia: "campanha de rede premium de hambúrguer artesanal, não encarte de supermercado",
  },

  restaurante: {
    rotulo: "restaurante, marmitaria e comida japonesa",
    termos: ["restaurante", "marmita", "marmitex", "marmitaria", "self-service", "self service", "comida caseira", "prato feito", "comida japonesa", "japonesa", "sushi", "temaki"],
    paleta: "tons de mesa posta: madeira, linho cru, cerâmica e grafite, com o colorido vindo do próprio prato",
    luz: "luz lateral suave de janela ou luz quente de salão, marcando vapor, brilho de molho e textura; nunca flash frontal",
    cena: "mesa posta com talher, guardanapo de tecido e um ou dois ingredientes frescos; marmita em superfície limpa; no japonês, prancha escura, hashi e shoyu, sem excesso",
    composicao: "prato em três-quartos ou vista de cima ocupando a maior massa visual, oferta em faixa discreta ou no respiro lateral",
    tipografia: "serif calorosa ou sans-serif humanista; em oferta de almoço, sans-serif semibold bem legível; nada de script fina",
    evitar: "foto de cardápio com fundo branco estourado, comida com cor artificial, salmão fluorescente, arroz sem textura, mesa lotada de itens",
    referencia: "cardápio de restaurante bem avaliado ou campanha de delivery premium, não panfleto de bairro",
  },

  pizzaria: {
    rotulo: "pizzaria",
    termos: ["pizza", "pizzaria", "esfiha", "calzone"],
    paleta: "madeira, terracota, carvão, creme, verde manjericão e vermelho tomate usados como comida, não como fundo",
    luz: "luz quente de forno, lateral alta, marcando a bolha da borda e o fio de queijo; leve brilho de azeite",
    cena: "pá de pizza, forno a lenha desfocado ao fundo, farinha, manjericão fresco, tábua rústica",
    composicao: "vista de topo quando a pizza inteira é o produto, close lateral quando a fatia e o fio de queijo são o apelo",
    tipografia: "sans-serif forte ou serif levemente rústica; evitar fonte italiana clichê de bandeira",
    evitar: "pizza com fatias perfeitas demais, queijo em laranja artificial, bandeira da Itália como decoração, fundo xadrez vermelho",
    referencia: "cardápio de pizzaria napolitana contemporânea",
  },

  acougue: {
    rotulo: "açougue e casa de carnes",
    termos: ["açougue", "acougue", "carne", "carnes", "churrasco", "churrascaria", "boi", "frigorífico", "frigorifico", "picanha", "costela"],
    paleta: "carvão, madeira escura, vinho profundo, marrom, creme e laranja queimado muito sutil — nunca vermelho saturado",
    luz: "luz quente lateral inspirada em brasa, realçando fibra, gordura e marmorização; fundo em penumbra com brasa desfocada, sem fogo exagerado",
    cena: "tábua de madeira grossa, sal grosso, faca de açougueiro, papel manteiga, ramo de alecrim, brasa desfocada ao fundo",
    composicao: "produto central ou inferior como protagonista, bastante respiro, grid elegante, preço em selo refinado",
    tipografia: "sans-serif limpa e forte, editorial; branco ou creme, sem contorno",
    evitar: "panfleto vermelho e amarelo, carne com cor saturada irreal, fogo grande e dramático, etiqueta de supermercado",
    referencia: "campanha de açougue premium acessível ou steakhouse, nunca encarte popular",
  },

  padaria: {
    rotulo: "padaria, confeitaria e doces",
    termos: ["padaria", "panificadora", "confeitaria", "doce", "doces", "bolo", "bolos", "pão", "pao", "cafeteria", "café", "cafe", "brigadeiro", "torta"],
    paleta: "creme, bege quente, marrom pão, branco leitoso, com um tom pastel da marca",
    luz: "luz natural de manhã, suave e difusa, vinda da lateral; sombra leve, clima acolhedor",
    cena: "linho, mármore claro, farinha, xícara, grão de café, migalhas reais, madeira clara",
    composicao: "mesa posta vista de cima ou close em três-quartos, muito respiro, sensação artesanal",
    tipografia: "serif elegante ou script discreta na headline, sans-serif limpa no resto",
    evitar: "excesso de confete e elementos fofos, saturação alta, brilho plástico na cobertura, fundo rosa choque",
    referencia: "catálogo de padaria artesanal ou confeitaria boutique",
  },

  acai: {
    rotulo: "açaí, sorveteria e sobremesas geladas",
    termos: ["açaí", "acai", "sorvete", "sorveteria", "gelato", "milk-shake", "milkshake", "picolé", "picole", "frozen"],
    paleta: "roxo profundo, violeta, magenta, verde folha e branco gelo — vibrante mas controlado, nunca neon",
    luz: "luz fria e limpa com alto contraste, realçando cremosidade e textura granulada; gotas de condensação",
    cena: "copo ou tigela transparente, frutas frescas cortadas, granola, folhas, gelo, respingo congelado",
    composicao: "close vertical do copo com fruta em primeiro plano desfocado, energia alta mas com respiro",
    tipografia: "sans-serif arredondada e forte, jovem; cores chapadas sem contorno",
    evitar: "roxo neon que estoura, excesso de respingos, fundo degradê arco-íris, topping flutuando sem gravidade",
    referencia: "campanha de franquia moderna de açaí",
  },

  bebidas: {
    rotulo: "bar, adega, distribuidora e bebidas",
    termos: ["bar", "adega", "cerveja", "chopp", "drink", "drinks", "coquetel", "distribuidora", "vinho", "whisky", "bebida", "bebidas", "pub"],
    paleta: "âmbar, dourado, verde garrafa, preto fosco, cobre e azul noite",
    luz: "contraluz marcando o líquido e a condensação, reflexo no vidro, fundo escuro com bokeh de bar",
    cena: "copo gelado com condensação, gelo, fatia de limão, balcão de madeira, garrafa em penumbra",
    composicao: "garrafa ou copo vertical como herói, contraluz separando do fundo, preço discreto",
    tipografia: "sans-serif condensada ou serif de rótulo; espaçamento generoso em peça premium",
    evitar: "espuma artificial exagerada, fundo com estourado de flash, apelo de embriaguez, excesso de selos",
    referencia: "anúncio de cervejaria artesanal ou editorial de destilado",
  },

  mercado: {
    rotulo: "mercado, hortifruti e produtos de consumo",
    termos: ["mercado", "supermercado", "mercearia", "hortifruti", "sacolão", "sacolao", "feira", "atacado", "varejo", "conveniência", "conveniencia"],
    paleta: "verde fresco, branco limpo, madeira clara e um tom de marca para o preço",
    luz: "luz clara e uniforme de mercado premium, frescor, sem sombra dura",
    cena: "caixote de madeira, gotas de água nos vegetais, sacola de papel, fundo limpo",
    composicao: "produto ou combo em arranjo organizado, preço com peso visual alto porque aqui preço é o argumento, mas em bloco desenhado",
    tipografia: "sans-serif forte e muito legível, números grandes e limpos",
    evitar: "colagem de dezenas de produtos, estrelas e explosões de desconto, vermelho e amarelo de encarte, texto em todo canto",
    referencia: "campanha de rede de mercado premium, não tabloide de ofertas",
  },

  beleza: {
    rotulo: "salão de beleza, estética e cuidados pessoais",
    termos: ["salão", "salao", "beleza", "estética", "estetica", "cabelo", "cabeleireiro", "manicure", "unha", "unhas", "sobrancelha", "cílios", "cilios", "depilação", "depilacao", "spa", "massagem"],
    paleta: "nude, rosé, bege quente, off-white, dourado suave e um tom escuro de contraste",
    luz: "luz suave e difusa de beauty dish, pele com brilho natural, sombra mínima",
    cena: "mármore, tecido, flor única, frasco, espelho, textura de pele real",
    composicao: "editorial com muito espaço negativo, rosto ou detalhe em close, texto em bloco lateral",
    tipografia: "serif fina e elegante ou sans-serif espaçada; nada pesado",
    evitar: "pele alisada até virar plástico, brilho e glitter em excesso, promessa de resultado médico, fonte script ilegível",
    referencia: "editorial de revista de beleza ou campanha de marca de skincare",
  },

  barbearia: {
    rotulo: "barbearia",
    termos: ["barbearia", "barber", "barbeiro", "corte masculino"],
    paleta: "preto fosco, couro, madeira escura, latão, cinza chumbo e branco",
    luz: "luz dura e direcional, contraste alto, clima masculino e urbano",
    cena: "cadeira de barbeiro, navalha, pente, tijolo aparente, toalha quente, espelho",
    composicao: "retrato em close ou plano médio com fundo escuro, texto em bloco firme",
    tipografia: "sans-serif condensada maiúscula ou slab serif vintage; nada delicado",
    evitar: "clichê de bigode desenhado e poste listrado como único conceito, filtro sépia pesado",
    referencia: "campanha de barbearia clássica contemporânea",
  },

  perfumaria: {
    rotulo: "perfumaria e cosmético",
    termos: ["perfume", "perfumaria", "fragrância", "fragrancia", "cosmético", "cosmetico", "maquiagem", "make", "skincare", "creme"],
    paleta: "preto, bege, branco limpo, dourado, âmbar ou um tom profundo de joia",
    luz: "luz cinematográfica com recorte, reflexo controlado no vidro, sombra longa e desenhada",
    cena: "superfície de pedra ou tecido, gota, flor seca, fundo com textura sutil; cena mínima",
    composicao: "produto isolado com muito respiro, enquadramento editorial, pouquíssimo texto",
    tipografia: "serif alta e espaçada ou sans-serif fina em caixa alta com tracking largo",
    evitar: "excesso de cards e selos, fundo colorido chapado, brilho estrelado artificial, muito texto",
    referencia: "anúncio de perfume de revista, nível aspiracional",
  },

  moda: {
    rotulo: "moda, vestuário e calçados",
    termos: ["moda", "roupa", "roupas", "boutique", "loja de roupa", "vestuário", "vestuario", "calçado", "calcado", "sapato", "tênis", "tenis", "bolsa", "acessório", "acessorio", "joia", "semijoia"],
    paleta: "neutros de passarela — off-white, areia, grafite, preto — com a cor da peça como único destaque",
    luz: "luz de estúdio limpa ou luz natural dura com sombra desenhada, conforme o posicionamento",
    cena: "fundo de ciclorama, parede texturizada, cabide, tecido caindo; cena limpa",
    composicao: "corpo inteiro ou close do detalhe, grid editorial, texto em canto com tracking largo",
    tipografia: "sans-serif fina em caixa alta espaçada, ou serif editorial; nada pesado",
    evitar: "colagem de várias peças, etiqueta de desconto gritante, fundo degradê colorido, pose artificial",
    referencia: "lookbook de marca ou campanha de e-commerce premium",
  },

  fitness: {
    rotulo: "academia, fitness e suplementos",
    termos: ["academia", "fitness", "musculação", "musculacao", "crossfit", "personal", "treino", "suplemento", "whey", "nutrição", "nutricao", "pilates", "funcional"],
    paleta: "preto, grafite, branco e uma cor de energia saturada (verde-limão, laranja ou azul elétrico) usada com disciplina",
    luz: "luz dura e direcional, contraluz marcando silhueta e suor, sombra forte e definida",
    cena: "equipamento, chão de borracha, poeira de magnésio, halteres, fundo industrial em penumbra",
    composicao: "diagonal dinâmica, corpo ou produto em movimento, texto em bloco angular, alto contraste",
    tipografia: "sans-serif condensada pesada em caixa alta, itálico sutil para movimento",
    evitar: "corpo com anatomia impossível, promessa de resultado em prazo, excesso de raios e explosões, fundo com chamas",
    referencia: "campanha de marca esportiva",
  },

  saude: {
    rotulo: "clínica, odontologia e serviços de saúde",
    termos: ["clínica", "clinica", "dentista", "odonto", "odontologia", "médico", "medico", "saúde", "saude", "fisioterapia", "psicólogo", "psicologo", "laboratório", "laboratorio", "exame", "consultório", "consultorio"],
    paleta: "azul sereno, verde-água, branco, cinza claro e um acento quente para humanizar",
    luz: "luz clara, difusa e uniforme; sensação de limpeza sem frieza de hospital",
    cena: "ambiente claro desfocado, planta, superfície lisa, pessoa real com expressão tranquila",
    composicao: "muito respiro, informação organizada em blocos claros, hierarquia direta e confiável",
    tipografia: "sans-serif humanista, legível, sem exageros",
    evitar: "imagem de procedimento invasivo, promessa de cura, antes e depois agressivo, estética de panfleto de posto",
    referencia: "comunicação de clínica particular moderna",
  },

  farmacia: {
    rotulo: "farmácia e drogaria",
    termos: ["farmácia", "farmacia", "drogaria", "remédio", "remedio", "medicamento", "manipulação", "manipulacao"],
    paleta: "branco, azul confiança, verde saúde e um tom de marca para a oferta",
    luz: "luz clara e uniforme, produto nítido e legível",
    cena: "fundo limpo com leve profundidade, superfície clara; o rótulo precisa ser lido",
    composicao: "produto nítido, preço em bloco organizado, informação secundária em área discreta",
    tipografia: "sans-serif muito legível; número grande e limpo no preço",
    evitar: "poluição de encarte, promessa terapêutica, excesso de selos, vermelho e amarelo gritante",
    referencia: "campanha de rede de farmácia moderna",
  },

  pet: {
    rotulo: "pet shop e serviços para animais",
    termos: ["pet", "petshop", "pet shop", "veterinária", "veterinaria", "banho e tosa", "ração", "racao", "cachorro", "gato", "animal"],
    paleta: "tons quentes e acolhedores — caramelo, creme, verde suave, azul claro — com acento alegre",
    luz: "luz natural suave, clima doméstico e afetivo",
    cena: "tapete, brinquedo, tigela, planta, sofá desfocado; animal com expressão natural",
    composicao: "close afetivo do animal ou produto com o animal em contexto, texto em bloco leve",
    tipografia: "sans-serif arredondada e amigável, sem infantilizar demais",
    evitar: "animal com anatomia ou olhos distorcidos, excesso de patinhas e ossinhos de decoração, saturação infantil",
    referencia: "campanha de marca de ração premium",
  },

  imobiliaria: {
    rotulo: "imobiliária, construção e arquitetura",
    termos: ["imobiliária", "imobiliaria", "imóvel", "imovel", "imóveis", "imoveis", "apartamento", "casa", "terreno", "construtora", "construção", "construcao", "arquitetura", "engenharia", "reforma", "móveis planejados", "moveis planejados"],
    paleta: "neutros arquitetônicos — concreto, areia, off-white, madeira, verde folhagem — com azul ou dourado de marca",
    luz: "luz natural de fim de tarde, sombra longa, valorizando volume e material",
    cena: "fachada, interior com profundidade, janela com luz, vegetação, mobiliário discreto",
    composicao: "linhas retas respeitadas, perspectiva correta, texto em faixa ou canto com muito respiro",
    tipografia: "sans-serif geométrica espaçada em caixa alta; sóbria",
    evitar: "perspectiva torta, janela com reflexo impossível, céu artificial chapado, excesso de informação de financiamento na arte",
    referencia: "material de lançamento imobiliário",
  },

  automotivo: {
    rotulo: "automotivo, oficina e autopeças",
    termos: ["carro", "automotivo", "auto center", "autocenter", "troca de óleo", "troca de oleo", "oficina", "mecânica", "mecanica", "autopeça", "autopeca", "pneu", "lava-jato", "funilaria", "moto", "veículo", "veiculo", "seguro auto"],
    paleta: "preto, grafite, prata, azul profundo e um acento de alerta usado com parcimônia",
    luz: "luz dura com reflexo controlado na lataria, contraluz marcando a silhueta, chão molhado refletindo",
    cena: "piso de concreto, garagem em penumbra, ferramenta, fundo urbano desfocado",
    composicao: "três-quartos do veículo ou close do detalhe, diagonal dinâmica, texto em bloco firme",
    tipografia: "sans-serif condensada pesada, técnica",
    evitar: "logo de montadora inventada, roda com geometria errada, excesso de fumaça e raio, fundo de chamas",
    referencia: "anúncio de concessionária ou marca de pneu",
  },

  servicos: {
    rotulo: "serviços profissionais e negócios",
    termos: ["advocacia", "advogado", "contabilidade", "contador", "consultoria", "despachante", "seguro", "financeira", "crédito", "credito", "corretor", "marketing", "agência", "agencia"],
    paleta: "azul profundo, grafite, branco, bege e um dourado ou verde discreto de credibilidade",
    luz: "luz de escritório controlada, suave e profissional",
    cena: "mesa, documento, caneta, ambiente corporativo desfocado, pessoa em postura confiante",
    composicao: "muito respiro, hierarquia tipográfica clara, grid rigoroso; a peça vende confiança",
    tipografia: "serif institucional ou sans-serif geométrica sóbria",
    evitar: "clichê de martelo e balança, aperto de mão genérico de banco de imagem, gráfico de barras decorativo, promessa de ganho",
    referencia: "comunicação de escritório estabelecido",
  },

  educacao: {
    rotulo: "educação, curso e treinamento",
    termos: ["curso", "escola", "aula", "treinamento", "mentoria", "faculdade", "ensino", "educação", "educacao", "idioma", "inglês", "ingles", "concurso", "vestibular"],
    paleta: "azul confiança, amarelo otimismo usado com disciplina, branco e um tom quente de acolhimento",
    luz: "luz clara e otimista, natural, sem drama",
    cena: "caderno, notebook, quadro, ambiente de estudo claro, pessoa real concentrada ou sorrindo",
    composicao: "informação organizada em blocos, data e benefício legíveis, hierarquia direta",
    tipografia: "sans-serif clara e moderna, muito legível",
    evitar: "colagem de ícones, excesso de informação na arte, promessa de aprovação garantida, estética de slide antigo",
    referencia: "campanha de escola ou plataforma de ensino moderna",
  },

  tecnologia: {
    rotulo: "tecnologia, eletrônicos e assistência",
    termos: ["celular", "eletrônico", "eletronico", "informática", "informatica", "computador", "notebook", "assistência técnica", "assistencia tecnica", "tecnologia", "games", "game", "eletro"],
    paleta: "preto, grafite, branco e um acento de luz (azul, ciano ou violeta) usado como glow controlado",
    luz: "luz de estúdio com reflexo nítido na tela e no vidro, contraluz sutil, fundo escuro com gradiente",
    cena: "superfície reflexiva, fundo escuro com profundidade, cabo ou acessório discreto",
    composicao: "produto isolado em ângulo preciso, muito respiro, especificação em bloco discreto",
    tipografia: "sans-serif geométrica fina ou média, técnica e espaçada",
    evitar: "tela com conteúdo ilegível ou interface inventada, excesso de glow neon, circuito desenhado de fundo, marca imitada",
    referencia: "página de produto de marca de eletrônicos",
  },

  eventos: {
    rotulo: "festa, evento e buffet",
    termos: ["festa", "evento", "buffet", "formatura", "casamento", "aniversário", "aniversario", "decoração", "decoracao", "balada", "show"],
    paleta: "definida pelo tema; base neutra escura ou clara com dois tons de destaque e metálico discreto",
    luz: "luz ambiente cênica com bokeh de luzes, clima noturno ou festivo conforme o evento",
    cena: "mesa posta, balões ou flores conforme o tema, luzes desfocadas ao fundo, textura de tecido",
    composicao: "data e local com alta legibilidade, hierarquia clara, moldura ou grid elegante",
    tipografia: "serif elegante ou script controlada na headline, sans-serif legível na informação",
    evitar: "confete e brilho em excesso, degradê arco-íris, fonte script ilegível na informação essencial",
    referencia: "convite de evento bem desenhado",
  },
};

// Fallback quando o nicho não casa com nenhum da biblioteca. Mantém o padrão
// profissional sem inventar uma estética de segmento que não conhecemos.
export const NICHO_GENERICO: GuiaNicho = {
  rotulo: "negócio local",
  paleta: "base neutra sofisticada (off-white, areia, grafite ou carvão) com uma cor de destaque vinda da marca",
  termos: [],
  luz: "luz direcional de estúdio, suave mas com direção clara, sombra natural",
  cena: "superfície com textura sutil, fundo com profundidade desfocada, poucos elementos de apoio",
  composicao: "ponto focal único, muito respiro, hierarquia clara entre produto, oferta e assinatura",
  tipografia: "sans-serif limpa e bem espaçada; no máximo duas famílias",
  evitar: "estética de panfleto, excesso de blocos de texto, cor saturada chapada no fundo",
  referencia: "peça de social media de marca bem posicionada",
};

// Minúsculas, sem acento e só com letras e números separados por um espaço.
function limpar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Procura por palavra inteira, aceitando plural. Por substring "barato" caía em
// bebidas (por causa de "bar") e "espaço" em beleza (por causa de "spa").
function temTermo(alvo: string, termo: string): boolean {
  const palavra = limpar(termo);
  return [palavra, `${palavra}s`, `${palavra}es`].some((t) => alvo.includes(` ${t} `));
}

// O texto cita algum dos termos? Mesma regra de palavra inteira da busca de guia.
export function citaAlgumTermo(texto: string, termos: string[]): boolean {
  const alvo = ` ${limpar(texto)} `;
  return alvo.trim().length > 0 && termos.some((termo) => temTermo(alvo, termo));
}

function acharGuia(texto: string): GuiaNicho | null {
  const alvo = ` ${limpar(texto)} `;
  if (!alvo.trim()) return null;

  let melhor: { guia: GuiaNicho; peso: number } | null = null;
  for (const guia of Object.values(NICHOS)) {
    for (const termo of guia.termos) {
      if (!temTermo(alvo, termo)) continue;
      // Termo mais longo é mais específico: "hamburgueria" ganha de "lanche".
      const peso = termo.length;
      if (!melhor || peso > melhor.peso) melhor = { guia, peso };
    }
  }
  return melhor?.guia ?? null;
}

// O nicho do cadastro manda. O pedido só decide quando o cadastro é genérico
// ("alimentação") e não casa com nenhum segmento: uma academia que anuncia o
// próprio aniversário continua sendo academia, não vira evento.
export function guiaDoNicho(nicho: string | null | undefined, pedido = ""): GuiaNicho {
  return acharGuia(nicho ?? "") ?? acharGuia(pedido) ?? NICHO_GENERICO;
}

// Bloco pronto para injetar no system prompt.
export function blocoDeNicho(guia: GuiaNicho): string {
  return [
    `## Direção de arte do segmento: ${guia.rotulo}`,
    `Paleta de referência: ${guia.paleta}.`,
    `Luz: ${guia.luz}.`,
    `Elementos de cena: ${guia.cena}.`,
    `Composição típica: ${guia.composicao}.`,
    `Tipografia: ${guia.tipografia}.`,
    `Erro clássico deste segmento, nunca cometer: ${guia.evitar}.`,
    `Padrão de qualidade esperado: ${guia.referencia}.`,
    `A identidade visual do cliente, quando houver, tem precedência sobre esta paleta — este bloco é o padrão do mercado, não uma regra acima da marca.`,
  ].join("\n");
}
