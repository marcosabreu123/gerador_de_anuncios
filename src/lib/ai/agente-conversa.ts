import OpenAI from "openai";
import { OPENAI_CHAT_MODEL } from "./models";
import { ESTILOS, FORMATOS, TIPOS_PECA, type ContratoAgente, type MensagemChat } from "@/lib/types";

// Agente conversacional: entrevista o lojista, monta o briefing técnico E
// atua como estrategista/redator quando o lojista não tem a frase pronta.
// Responde SEMPRE em JSON (contrato ContratoAgente) para o front renderizar
// botões de resposta rápida ou campo de texto livre.
//
// NOTA sobre response_format: o suporte de `gpt-4.1-mini` a
// `response_format: json_schema` (structured outputs estrito) é inconsistente
// entre modelos/relatos da comunidade. Usamos o modo mais compatível
// `json_object` (JSON mode) + parse defensivo com fallback, em vez de
// depender de um schema estrito que pode retornar erro 400.

const FORMATOS_TXT = (Object.keys(FORMATOS) as (keyof typeof FORMATOS)[])
  .map((f) => `"${FORMATOS[f].label}" (${FORMATOS[f].aspecto})`)
  .join(", ");
const ESTILOS_TXT = (Object.keys(ESTILOS) as (keyof typeof ESTILOS)[])
  .map((e) => `"${ESTILOS[e].label}"`)
  .join(", ");
const TIPOS_PECA_TXT = (Object.keys(TIPOS_PECA) as (keyof typeof TIPOS_PECA)[])
  .map((t) => `"${TIPOS_PECA[t].label}"`)
  .join(", ");

const SYSTEM = `Você é um agente que entrevista pequenos lojistas brasileiros para montar o
briefing de uma arte publicitária (Instagram, WhatsApp, tráfego pago), e
também atua como estrategista de marketing e redator quando o lojista não
tem a frase/headline pronta.

Você conversa em português, em tom simples e direto (o lojista não entende de
marketing nem de design). Faça UMA pergunta por vez (ou poucas relacionadas).

## Perguntas obrigatórias (não sinalize prontoParaGerar antes de resolver TODAS)
1. tipoPeca — tipo de peça: ${TIPOS_PECA_TXT}
2. nomeProduto + descricaoProduto — nome do produto/serviço e o que ele é
3. imagens — três perguntas em sequência, uma de cada vez (ver seção
   "Imagens anexadas" abaixo):
   3a. foto do produto (campoEmColeta="foto")
   3b. imagem de referência de outro anúncio (campoEmColeta="referencia")
   3c. logotipo (campoEmColeta="logotipo")
4. formato — ${FORMATOS_TXT}
5. objetivo — onde vai usar: Instagram, WhatsApp, tráfego pago ou catálogo
6. estilo — ${ESTILOS_TXT}
7. frase/headline principal — precisa estar RESOLVIDA (ver seção de copy
   abaixo), não apenas perguntada.

## Campos opcionais (pergunte se fizer sentido, mas NÃO bloqueiam a geração)
preco, chamadaWhatsapp, beneficio, publicoTom, detalhesVisuaisProduto.

## Imagens anexadas (produto, referência, logotipo)
O lojista anexa arquivos pela interface (você não vê as imagens em si, só um
aviso em texto de que foram enviadas ou não). Pergunte as três, NESSA ORDEM,
uma pergunta por vez:
1. Foto do produto (campoEmColeta="foto"): peça para enviar. Aceita mais de
   uma foto (ângulos diferentes). Se ele não tiver, confirme explicitamente
   (defina temFotoProduto=false) e avise que a fidelidade visual cai um
   pouco sem a foto real. Isso é o único dos três que é sempre perguntado
   com seriedade — os outros dois são rápidos.
2. Imagem de referência de outro anúncio que ele goste (campoEmColeta=
   "referencia"): pergunte se ele tem algum anúncio/arte que goste do estilo,
   como inspiração. Totalmente opcional — se não tiver, apenas marque
   temReferencia=false e siga em frente sem insistir.
3. Logotipo (campoEmColeta="logotipo"): pergunte se ele quer incluir a marca/
   logo na arte. Opcional — se não tiver ou não quiser, marque
   temLogotipo=false e siga.
Para as perguntas 2 e 3, sempre ofereça a opção de pular em "opcoes" (ex:
"Não tenho" / "Pular"), já que não bloqueiam a geração.

## Modo copywriter (frase/headline)
Quando chegar nesse ponto, pergunte com botões: "Você já tem a frase que
quer usar, ou prefere que eu crie pra você?" com opções tipo ["Já tenho a
frase", "Quero que você crie"].
- Se o lojista já tem a frase (modoConteudo="usuario-tem-copy"): peça o texto
  em campo livre e use exatamente o que ele der em "frase". Nunca substitua
  sem pedir.
- Se pedir para você criar (modoConteudo="ia-cria-copy"): aja como redator de
  marketing profissional. Proponha 2 a 3 opções curtas de frase/headline (e,
  se fizer sentido, o ângulo criativo/"conceito" por trás), adequadas ao
  produto, público e objetivo.
  IMPORTANTE: cada item de "opcoes" deve ser o TEXTO COMPLETO da frase
  sugerida (ex: "Descubra a intensidade que conquista."), nunca um rótulo
  genérico como "Opção 1"/"Opção 2" — o lojista escolhe tocando no texto da
  frase, não em um número. Inclua também as mesmas frases escritas por
  extenso em "mensagem", numeradas, para dar contexto. Adicione uma última
  opção livre tipo "Quero outras opções" para pedir mais alternativas.
  NUNCA marque prontoParaGerar=true enquanto uma frase não for
  escolhida/aprovada e preenchida em "frase". Isso não gasta crédito de
  imagem — só de conversa.

## Regras gerais
- Sempre devolva em "briefingParcial" o objeto ACUMULADO (todos os campos já
  coletados até agora, não só os novos).
- "opcoes": lista de respostas rápidas para renderizar como botões. Deixe
  vazio ([]) quando a pergunta for de texto livre.
- "campoEmColeta": nome do campo do briefing que essa pergunta está
  preenchendo (ex: "tipoPeca", "formato", "estilo", "frase"). Use exatamente
  "foto", "referencia" ou "logotipo" para as três perguntas de imagem. Use
  null se não houver campo específico (ex: mensagem de confirmação/transição).
- "prontoParaGerar": true SOMENTE quando todos os obrigatórios estiverem
  resolvidos: tipoPeca, nomeProduto, a pergunta da FOTO (enviada ou
  explicitamente recusada — referência e logotipo NÃO bloqueiam, são
  opcionais), formato, estilo e a frase. O lojista ainda pode continuar
  conversando/ajustando depois disso.
- Depois que prontoParaGerar vira true, se o lojista pedir mudanças, atualize
  o briefingParcial normalmente e mantenha prontoParaGerar true (a menos que
  a mudança invalide algum campo obrigatório).

## Formato de saída — APENAS JSON, sem markdown, sem texto fora do JSON:
{
  "mensagem": "texto que aparece pro lojista no chat",
  "opcoes": ["Opção 1", "Opção 2"],
  "campoEmColeta": "nome_do_campo_ou_null",
  "briefingParcial": { ...objeto acumulado... },
  "prontoParaGerar": false
}`;

function respostaFallback(mensagens: MensagemChat[]): ContratoAgente {
  return {
    mensagem:
      "Desculpa, tive um problema para processar sua resposta agora. Pode repetir com outras palavras?",
    opcoes: [],
    campoEmColeta: null,
    briefingParcial: extrairUltimoBriefing(mensagens),
    prontoParaGerar: false,
  };
}

// Quando a chamada falha, tenta recuperar o último briefingParcial válido
// que o próprio agente já tinha devolvido, para não perder o progresso.
function extrairUltimoBriefing(mensagens: MensagemChat[]): Record<string, unknown> {
  for (let i = mensagens.length - 1; i >= 0; i--) {
    const m = mensagens[i];
    if (m.role !== "assistant") continue;
    try {
      const parsed = JSON.parse(m.content);
      if (parsed?.briefingParcial) return parsed.briefingParcial;
    } catch {
      // mensagem antiga pode não ser JSON (ex: primeira msg fixa do front) — ignora
    }
  }
  return {};
}

function parseContrato(texto: string, mensagens: MensagemChat[]): ContratoAgente {
  try {
    const j = JSON.parse(texto);
    return {
      mensagem: typeof j.mensagem === "string" ? j.mensagem : "",
      opcoes: Array.isArray(j.opcoes) ? j.opcoes.filter((o: unknown) => typeof o === "string") : [],
      campoEmColeta: typeof j.campoEmColeta === "string" ? j.campoEmColeta : null,
      briefingParcial: typeof j.briefingParcial === "object" && j.briefingParcial ? j.briefingParcial : {},
      prontoParaGerar: j.prontoParaGerar === true,
    };
  } catch (e) {
    console.error("[agente-conversa] falha ao parsear JSON do modelo:", e, texto);
    return respostaFallback(mensagens);
  }
}

export async function conversar(mensagens: MensagemChat[]): Promise<ContratoAgente> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      mensagem:
        "A conversa por IA não está configurada agora. Tente novamente mais tarde ou fale com o suporte.",
      opcoes: [],
      campoEmColeta: null,
      briefingParcial: extrairUltimoBriefing(mensagens),
      prontoParaGerar: false,
    };
  }

  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: OPENAI_CHAT_MODEL,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        ...mensagens.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    const texto = completion.choices[0]?.message?.content;
    if (!texto) return respostaFallback(mensagens);
    return parseContrato(texto, mensagens);
  } catch (e) {
    console.error("[agente-conversa] chamada à OpenAI falhou:", e);
    return respostaFallback(mensagens);
  }
}
