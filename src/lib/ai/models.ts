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
// perguntas de nicho. Roda a cada turno da conversa — melhor custo-benefício.
export const TEXT_AGENT_MODEL = "gpt-5.4-mini";

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
export const IMAGE_MODEL = "gpt-image-2";
export const IMAGE_PREMIUM_MODEL = "gpt-image-2";

// Qual qualidade usar em cada etapa do fluxo de imagem. gpt-image-2 é bem
// mais lento que o Gemini usado antes (chegou a 71s numa geração de teste
// em "medium"), e a function tem um teto de 60s (maxDuration, também o
// limite rígido do plano Vercel atual) — por isso rascunho usa "low" e só
// gera 1 variação, pra reduzir o risco de timeout (que além de falhar
// derruba o crédito sem estorno, já que a plataforma mata o processo antes
// do catch rodar).
// - rascunho (geração inicial, 1 variação): low — mais rápido.
// - final (ajuste pontual / edição direta, sempre 1 imagem): medium —
//   um pouco mais de qualidade, ainda com boa margem dentro do timeout.
export type Etapa = "rascunho" | "final";

export function qualidadeParaEtapa(etapa: Etapa): "low" | "medium" {
  return etapa === "final" ? "medium" : "low";
}

// Tamanho (WIDTHxHEIGHT) por formato — gpt-image-2 aceita resoluções
// customizadas, múltiplas de 16, com razão de aspecto entre 1:3 e 3:1.
export const TAMANHO_POR_FORMATO: Record<Formato, string> = {
  "story-9-16": "1088x1920",
  "feed-4-5": "1024x1280",
  "quadrado-1-1": "1024x1024",
};

// ---------- Legado (Gemini, sem uso por padrão) ----------
// Mantidos só pra src/lib/ai/gemini.ts continuar compilando caso precise
// voltar a usar — nenhum código do fluxo atual importa esses dois.
export const GEMINI_PRO_IMAGE = "gemini-3-pro-image"; // Nano Banana Pro
export const GEMINI_FLASH_IMAGE = "gemini-3.1-flash-image"; // Nano Banana 2
