import { ESTILOS, FORMATOS, OBJETIVOS, TIPOS_PECA, type BriefingParcial, type EstiloVisual } from "@/lib/types";

// O agente conversacional às vezes devolve o LABEL em português (ex: "Story",
// "Luxo escuro") em vez da chave interna ("story-9-16", "luxo-escuro") nesses
// campos, mesmo sendo instruído a usar a chave. Em vez de confiar cegamente
// no LLM, normalizamos aqui: se já for uma chave válida, mantém; senão,
// tenta casar por label (case-insensitive, ignorando acentos/pontuação).

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos (marcas diacríticas combinantes)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function resolverChave<T extends string>(
  valor: string | undefined,
  dicionario: Record<T, { label: string }>,
): T | undefined {
  if (!valor) return undefined;
  const chaves = Object.keys(dicionario) as T[];
  if ((chaves as string[]).includes(valor)) return valor as T;

  const alvo = slugify(valor);
  // 1) match exato por label/chave.
  const exato = chaves.find((k) => slugify(dicionario[k].label) === alvo || slugify(k) === alvo);
  if (exato) return exato;

  // 2) match por prefixo (cobre casos como "Story (9:16)" -> label "Story").
  return chaves.find((k) => {
    const labelSlug = slugify(dicionario[k].label);
    return alvo.startsWith(labelSlug) || labelSlug.startsWith(alvo);
  });
}

// estiloVisual tem o valor sentinela "estilo-livre" (fora do dicionário
// ESTILOS) — passa direto sem tentar casar por label.
function resolverEstilo(valor: EstiloVisual | undefined): EstiloVisual | undefined {
  if (!valor) return undefined;
  if (valor === "estilo-livre") return valor;
  return resolverChave(valor, ESTILOS) ?? valor;
}

export function normalizarBriefing(b: BriefingParcial): BriefingParcial {
  return {
    ...b,
    tipoPeca: resolverChave(b.tipoPeca, TIPOS_PECA) ?? b.tipoPeca,
    formato: resolverChave(b.formato, FORMATOS) ?? b.formato,
    objetivo: resolverChave(b.objetivo, OBJETIVOS) ?? b.objetivo,
    estiloVisual: resolverEstilo(b.estiloVisual),
  };
}
