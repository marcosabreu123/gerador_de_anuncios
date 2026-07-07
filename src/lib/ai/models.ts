import type { Formato } from "@/lib/types";

// IDs de modelos centralizados — fácil trocar conforme custo/qualidade.
//
// Gemini foi deixado de lado por enquanto (ver src/lib/ai/gemini.ts, mantido
// no repo mas sem uso — dá pra voltar facilmente se precisar). A geração de
// imagem agora usa a API de imagem da própria OpenAI (src/lib/ai/openai-image.ts).

// ---------- Texto (conversa / prompt-builder / roteamento) ----------
// Três papéis com custo/capacidade diferentes — não usamos o modelo mais
// caro em todo turno da conversa, só na etapa que realmente precisa dele.

// Assistente conversacional: entrevista o lojista, monta o briefing,
// perguntas de nicho. Roda a cada turno da conversa. Testamos gpt-5.4-mini
// primeiro pelo custo-benefício, mas ele não seguia com confiabilidade
// instruções mais longas do system prompt (pulava a pergunta aberta de
// composição de conteúdo, confirmava o resumo sem preencher a headline) —
// voltamos pro gpt-5.4 aqui até esses casos ficarem mais robustos.
export const TEXT_AGENT_MODEL = "gpt-5.4";

// Prompt-builder final: direção de arte, hierarquia visual, copy e estrutura
// do prompt de imagem. Só roda uma vez, quando o briefing já está pronto —
// por isso pode usar o modelo mais forte sem pesar no custo por conversa.
export const TEXT_PROMPT_BUILDER_MODEL = "gpt-5.4";

// Roteamento e tarefas simples: classificar ajuste pontual vs. nova criação,
// reescrever prompt de ajuste/edição direta. Tarefas mecânicas, não precisam
// do modelo mais forte.
export const TEXT_ROUTER_MODEL = "gpt-5.4-nano";

// Modo premium/teste opcional — não usado por padrão em lugar nenhum do
// fluxo hoje; fica disponível pra ligar manualmente em teste ou numa
// oferta premium futura sem precisar redeployar com outro valor.
export const TEXT_PREMIUM_MODEL = "gpt-5.5";

// ---------- Imagem (OpenAI) ----------
// Usada só pra COMPOR uma arte do zero (ou a partir de uma foto de produto
// crua): geração inicial e "gerar outra variação". Edição de arte já pronta
// usa FAL (ver FAL_EDIT_MODEL abaixo) — ver histórico da constante.
export const IMAGE_MODEL = "gpt-image-2";
export const IMAGE_PREMIUM_MODEL = "gpt-image-2";

// Qual qualidade usar em cada etapa do fluxo de imagem. gpt-image-2 é bem
// mais lento que o Gemini usado antes, e a function tem um teto de 60s
// (maxDuration, também o limite rígido do plano Vercel atual) — por isso
// TODA etapa usa "low", pra reduzir o risco de timeout (que além de falhar
// derruba o crédito sem estorno, já que a plataforma mata o processo antes
// do catch rodar).
export type Etapa = "rascunho" | "final";

export function qualidadeParaEtapa(_etapa: Etapa): "low" {
  return "low";
}

// Tamanho (WIDTHxHEIGHT) por formato — gpt-image-2 aceita resoluções
// customizadas, múltiplas de 16, com razão de aspecto entre 1:3 e 3:1.
export const TAMANHO_POR_FORMATO: Record<Formato, string> = {
  "story-9-16": "1088x1920",
  "feed-4-5": "1024x1280",
  "quadrado-1-1": "1024x1024",
};

// ---------- Edição de imagem (FAL) ----------
// Ajuste pontual e edição direta de design (/api/adjust, /api/edit-design)
// editam uma arte JÁ PRONTA (texto+logo+foto) — medido ao vivo: a mesma
// edição via gpt-image-2 levava 79-93s mesmo em qualidade baixa (arriscando
// estourar o teto de 60s da function); Flux Kontext Pro faz a mesma edição
// por instrução em ~13-25s, mas às vezes erra ao ADICIONAR texto novo (só é
// confiável pra MODIFICAR o que já existe) e cada edição encadeada acumula
// pequena degradação nos textos não relacionados.
export const FAL_EDIT_MODEL = "fal-ai/flux-pro/kontext";

// Testamos Ideogram (v2/edit exige mask_url — inpainting de região, não
// temos como gerar a máscara sem um sistema de overlay/posicionamento) e
// Recraft (v3/image-to-image, mesmo em strength baixo recriava a arte
// inteira: mudava cor de fundo, inventava textos e logo) como alternativas
// de ajuste com texto integrado — nenhum dos dois preserva o resto da arte
// como o Flux Kontext. Descartados por enquanto (ver histórico da sessão).

// Liga/desliga o Flux Kontext como provider de ajuste. Padrão agora é FALSE
// (Vercel Pro assinado — teto de function bem acima de 60s, ver maxDuration
// em /api/adjust e /api/edit-design): ajustes usam gpt-image-2 (via
// /images/edits), mais fiel e confiável pra adicionar/alterar texto e logo,
// ao custo de ~79-93s por ajuste. Defina ENABLE_FLUX_EDIT=true pra voltar ao
// Flux Kontext (mais rápido, ~13-25s, mas menos confiável em texto novo).
export const ENABLE_FLUX_EDIT = process.env.ENABLE_FLUX_EDIT === "true";

// ---------- Legado (Gemini, sem uso por padrão) ----------
// Mantidos só pra src/lib/ai/gemini.ts continuar compilando caso precise
// voltar a usar — nenhum código do fluxo atual importa esses dois.
export const GEMINI_PRO_IMAGE = "gemini-3-pro-image"; // Nano Banana Pro
export const GEMINI_FLASH_IMAGE = "gemini-3.1-flash-image"; // Nano Banana 2
