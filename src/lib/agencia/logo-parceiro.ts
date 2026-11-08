import type { Referencia } from "./types";

// Logo de programa ou parceiro, como a do CNH do Brasil numa autoescola. Ela não
// assina a peça, como a logo da marca: entra só quando o pedido cita o nome dela,
// que fica guardado na descrição do material.

// Palavras de ligação não contam: "CNH do Brasil" e "CNH Brasil" são o mesmo nome.
const LIGACOES = new Set(["de", "do", "da", "dos", "das", "e"]);

// Minúsculas e sem acento, uma palavra por item.
function palavras(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// O texto cita o nome quando as palavras dele aparecem em sequência, sem contar as de
// ligação. Hashtag também vale: "#CNHdoBrasil" vira uma palavra só, o nome colado.
// "CNH" sozinha não basta: autoescola fala de CNH o tempo todo.
export function citaONome(texto: string, nome: string): boolean {
  const doNome = palavras(nome);
  const fortes = doNome.filter((p) => !LIGACOES.has(p));
  if (fortes.length === 0) return false;

  const doTexto = palavras(texto);
  const colados = new Set([doNome.join(""), fortes.join("")]);
  if (doTexto.some((p) => colados.has(p))) return true;

  const seguidas = doTexto.filter((p) => !LIGACOES.has(p));
  for (let i = 0; i + fortes.length <= seguidas.length; i++) {
    if (fortes.every((p, k) => seguidas[i + k] === p)) return true;
  }
  return false;
}

// O mesmo nome escrito de outro jeito: "CNH do Brasil", "cnh brasil".
export function mesmoNome(a: string, b: string): boolean {
  const limpo = (t: string) => palavras(t).filter((p) => !LIGACOES.has(p)).join(" ");
  return limpo(a) !== "" && limpo(a) === limpo(b);
}

// Logos de parceiro que o texto cita. No máximo duas, porque cada imagem anexada
// encarece a geração. As referências chegam da mais nova para a mais antiga, então,
// com o mesmo nome cadastrado duas vezes, vale a logo enviada por último.
export function logosParceirosCitados(referencias: Referencia[], texto: string | undefined): Referencia[] {
  if (!texto?.trim()) return [];
  const escolhidas: Referencia[] = [];
  for (const r of referencias) {
    const nome = r.descricao?.trim();
    if (r.tipo !== "logo_parceiro" || !nome || !citaONome(texto, nome)) continue;
    if (escolhidas.some((e) => mesmoNome(e.descricao ?? "", nome))) continue;
    escolhidas.push(r);
    if (escolhidas.length === 2) break;
  }
  return escolhidas;
}
