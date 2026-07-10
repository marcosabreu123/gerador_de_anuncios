import type {
  BriefingParcial,
  CardPerguntas,
  ConteudoComposicaoModo,
  EstiloComunicacao,
  Formato,
  FormatoCanal,
  GrupoPergunta,
  Objetivo,
  ObjetivoMarketing,
  PreferenciaCores,
} from "@/lib/types";

// Card principal do fluxo rápido de criação — fixo (não gerado pelo modelo),
// pra não gastar chamada à IA a cada botão clicado e pra nunca repetir uma
// pergunta que já tem resposta pronta (objetivo/formato/estilo/cores/texto).
// Client-safe: importado tanto pelo ChatWizard (client) quanto pelo agente
// conversacional (server) — por isso não pode importar nada de "openai".
export const CARD_BRIEFING_PRINCIPAL: CardPerguntas = {
  titulo: "Agora escolha rapidinho o caminho da arte:",
  grupos: [
    {
      id: "objetivoMarketing",
      pergunta: "Objetivo da arte",
      opcoes: [
        { label: "Vender rápido", value: "vender_rapido" },
        { label: "Divulgar novidade", value: "divulgar_novidade" },
        { label: "Chamar no WhatsApp", value: "chamar_whatsapp" },
        { label: "Fortalecer marca", value: "fortalecer_marca" },
        { label: "IA decide", value: "ia_decide" },
      ],
    },
    {
      id: "formatoCanal",
      pergunta: "Formato",
      opcoes: [
        { label: "Story", value: "story" },
        { label: "Feed", value: "feed" },
        { label: "WhatsApp", value: "whatsapp" },
        { label: "Tráfego pago", value: "trafego_pago" },
        { label: "IA decide", value: "ia_decide" },
      ],
    },
    {
      id: "estiloComunicacao",
      pergunta: "Estilo visual",
      opcoes: [
        { label: "Premium", value: "premium" },
        { label: "Clean", value: "clean" },
        { label: "Chamativo", value: "chamativo" },
        { label: "Moderno", value: "moderno" },
        { label: "Divertido", value: "divertido" },
        { label: "IA decide", value: "ia_decide" },
      ],
    },
    {
      id: "preferenciaCores",
      pergunta: "Cores",
      opcoes: [
        { label: "Cores do segmento", value: "segmento" },
        { label: "Cores da minha marca", value: "marca" },
        { label: "Seguir referência enviada", value: "referencia" },
        { label: "IA decide", value: "ia_decide" },
      ],
    },
    {
      id: "conteudoComposicaoModo",
      pergunta: "Conteúdo da composição",
      opcoes: [
        { label: "Quero informar o que deve aparecer", value: "usuario_informa" },
        { label: "Criar conteúdo para mim", value: "ia_cria" },
        { label: "Só destacar a oferta", value: "destacar_oferta" },
        { label: "Usar apenas o que já falei", value: "usar_o_que_ja_falou" },
      ],
    },
  ],
  botaoEnviar: "Enviar respostas",
};

// Campo de texto que aparece logo abaixo de um grupo quando uma opção
// específica é escolhida (ex.: "Quero informar o que deve aparecer" abre o
// campo aberto de composição — não é só uma frase de destaque, pode ser
// título, preço, WhatsApp, entrega, selo etc.). Chave: "<idDoGrupo>:<value>".
// Só existe pro card principal — o card de segmento (gerado pelo agente)
// não tem campos condicionais.
export const CAMPOS_CONDICIONAIS_PRINCIPAL: Record<string, { label: string; placeholder: string }> = {
  "conteudoComposicaoModo:usuario_informa": {
    label: "O que você quer que apareça na composição?",
    placeholder: "Ex: título, preço, produto, promoção, WhatsApp, entrega, endereço, CTA, selo ou alguma observação",
  },
  "preferenciaCores:marca": {
    label: "Quais cores sua marca usa?",
    placeholder: "Ex: roxo e amarelo, preto e vermelho, azul e branco...",
  },
};

// Formata as respostas de um card (grupo escolhido + campos condicionais)
// como uma única mensagem de texto legível — é isso que vira a mensagem do
// usuário na conversa, enviada de uma vez só quando ele clica em "Enviar
// respostas" (nunca a cada clique em botão).
export function formatarRespostasCard(
  card: CardPerguntas,
  selecoes: Record<string, string>,
  camposTexto: Record<string, string>,
): string {
  const linhas = card.grupos.map((g) => {
    const valor = selecoes[g.id];
    const opcao = g.opcoes.find((o) => o.value === valor);
    let linha = `${g.pergunta}: ${opcao?.label ?? "não respondido"}`;
    const extra = camposTexto[`${g.id}:${valor}`];
    if (extra?.trim()) linha += ` ("${extra.trim()}")`;
    return linha;
  });
  return linhas.join("\n");
}

// Mapa de conveniência: cada opção de "Formato" no card rápido já resolve
// tanto a proporção final da arte (Formato) quanto o canal/destino
// (Objetivo, campo já existente no briefing) — "IA decide" deixa os dois em
// aberto pro agente/prompt-builder decidirem depois.
const MAPA_FORMATO_CANAL: Record<Exclude<FormatoCanal, "ia_decide">, { formato: Formato; objetivo: Objetivo }> = {
  story: { formato: "story-9-16", objetivo: "instagram" },
  feed: { formato: "feed-4-5", objetivo: "instagram" },
  whatsapp: { formato: "quadrado-1-1", objetivo: "whatsapp" },
  trafego_pago: { formato: "feed-4-5", objetivo: "trafego-pago" },
};

// Converte as seleções do card principal (feitas no front, sem depender da
// IA acertar a transcrição) direto em campos do briefing — essas escolhas
// nunca dependem do modelo ecoar corretamente um JSON.
export function selecoesCardPrincipalParaBriefing(
  selecoes: Record<string, string>,
  camposTexto: Record<string, string>,
): BriefingParcial {
  const parcial: BriefingParcial = {};

  const objetivoMarketing = selecoes.objetivoMarketing as ObjetivoMarketing | undefined;
  if (objetivoMarketing) parcial.objetivoMarketing = objetivoMarketing;

  const formatoCanal = selecoes.formatoCanal as FormatoCanal | undefined;
  if (formatoCanal) {
    parcial.formatoCanal = formatoCanal;
    if (formatoCanal !== "ia_decide") {
      const mapa = MAPA_FORMATO_CANAL[formatoCanal];
      parcial.formato = mapa.formato;
      parcial.objetivo = mapa.objetivo;
    }
  }

  const estiloComunicacao = selecoes.estiloComunicacao as EstiloComunicacao | undefined;
  if (estiloComunicacao) parcial.estiloComunicacao = estiloComunicacao;

  const preferenciaCores = selecoes.preferenciaCores as PreferenciaCores | undefined;
  if (preferenciaCores) {
    parcial.preferenciaCores = preferenciaCores;
    if (preferenciaCores === "marca") {
      const cores = camposTexto["preferenciaCores:marca"];
      if (cores?.trim()) parcial.coresMarca = cores.trim();
    }
  }

  const conteudoComposicaoModo = selecoes.conteudoComposicaoModo as ConteudoComposicaoModo | undefined;
  if (conteudoComposicaoModo) {
    parcial.conteudoComposicaoModo = conteudoComposicaoModo;
    if (conteudoComposicaoModo === "usuario_informa") {
      const conteudo = camposTexto["conteudoComposicaoModo:usuario_informa"];
      if (conteudo?.trim()) parcial.conteudoComposicaoUsuario = conteudo.trim();
    }
  }

  return parcial;
}

// Converte as respostas do bloco extra de segmento (gerado pelo agente, ver
// agente-conversa.ts) em pares pergunta/resposta — mesmo formato que
// `perguntasSegmento` já usava no briefing antigo, sem introduzir um campo
// novo redundante.
export function selecoesCardSegmentoParaPerguntas(
  grupos: GrupoPergunta[],
  selecoes: Record<string, string>,
): { pergunta: string; resposta: string }[] {
  return grupos.map((g) => {
    const valor = selecoes[g.id];
    const opcao = g.opcoes.find((o) => o.value === valor);
    return { pergunta: g.pergunta, resposta: opcao?.label ?? valor ?? "" };
  });
}
