// O que a loja teria de cumprir se aparecesse na arte. O "Melhorar minha ideia"
// avisa quando uma destas palavras surge sem estar no pedido nem no cadastro (ver
// avisosDeFidelidade), e por isso o cadastro não deve trazê-las: palavra que está
// nele passa sem aviso. Fica aqui, sem nada de servidor, porque a tela do cadastro
// com IA também confere.
export const PROMESSAS =
  /(?<!\p{L})(hoje|gr[aá]tis|descontos?|brindes?|garantias?|parcel\p{L}*|[uú]ltimas?|limitad[ao]s?|melhor(es)?|mais barat[ao]s?|menor pre[çc]o|por menos)(?!\p{L})/giu;

// As palavras de promessa de um texto, em minúsculas e sem repetir.
export function promessasEm(texto: string): string[] {
  return [...new Set((texto.match(PROMESSAS) ?? []).map((p) => p.toLowerCase()))];
}
