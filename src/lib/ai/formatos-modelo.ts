import type { FichaCriativa } from "./diretor-arte";

// Traduz a ficha criativa para o dialeto de cada gerador de imagem.
//
// Os modelos não leem prompt do mesmo jeito, e a diferença é grande o bastante
// para mudar o resultado com a mesma direção de arte:
//
// - gpt-image-2 segue prosa instrucional em seções e lida bem com prompt longo.
// - FLUX.2 aceita JSON nativamente e amarra cor por hex com fidelidade alta,
//   mas NÃO tem prompt negativo — a Black Forest Labs recomenda descrever o que
//   se quer em vez do que se quer evitar.
// - Os modelos do Gemini respondem melhor a instrução conversacional direta.
// - Ideogram é construído em cima de tipografia: o texto a renderizar vem
//   primeiro e o resto é contexto.
//
// Em todos, o texto que deve aparecer na arte vai entre aspas: é a convenção
// que os geradores atuais usam para separar texto a renderizar de descrição.

export type DialetoModelo = "gpt-image" | "flux" | "gemini" | "ideogram" | "generico";

const ORDEM_PAPEIS = ["headline", "subheadline", "preco", "cta", "assinatura", "apoio"] as const;

function textosOrdenados(ficha: FichaCriativa) {
  return [...ficha.textos].sort(
    (a, b) => ORDEM_PAPEIS.indexOf(a.papel) - ORDEM_PAPEIS.indexOf(b.papel),
  );
}

const NOME_PAPEL: Record<string, string> = {
  headline: "headline",
  subheadline: "subheadline",
  preco: "price callout",
  cta: "call to action",
  assinatura: "brand signature",
  apoio: "supporting info",
};

function linhaDeTexto(t: FichaCriativa["textos"][number]): string {
  const partes = [`${NOME_PAPEL[t.papel] ?? t.papel}: "${t.conteudo}"`];
  if (t.posicao) partes.push(`placed ${t.posicao}`);
  if (t.tratamento) partes.push(t.tratamento);
  return `- ${partes.join(" — ")}`;
}

function paletaEmLinha(ficha: FichaCriativa): string {
  return ficha.paleta.map((c) => `${c.hex} (${c.nome}, ${c.uso})`).join("; ");
}

// Texto que vale para qualquer modelo: a exigência de fidelidade literal.
// Sem isto o modelo reescreve preço e telefone, que é o erro mais caro aqui.
function regraDeTexto(ficha: FichaCriativa): string {
  if (ficha.textos.length === 0) return "Do not add any text, lettering or numbers to the image.";
  return [
    "Render every text string EXACTLY as written, character for character, including currency symbols, commas and accents.",
    "Do not translate, rephrase, reformat or add any text. No extra words, no invented background text, no watermark.",
    "Keep every word whole — never break a word across lines.",
  ].join(" ");
}

// ---------------------------------------------------------------------------
// gpt-image-2 — prosa em seções
// ---------------------------------------------------------------------------
function paraGptImage(ficha: FichaCriativa, formatoDescricao: string): string {
  const blocos: string[] = [];

  blocos.push(
    `Create a professional advertising image, ${formatoDescricao}. ${ficha.estiloFotografico}. Finish: ${ficha.acabamento}.`,
  );

  if (ficha.cena) blocos.push(`SCENE\n${ficha.cena}`);
  if (ficha.produtoNaCena) blocos.push(`SUBJECT\n${ficha.produtoNaCena}`);
  if (ficha.luz) blocos.push(`LIGHTING\n${ficha.luz}`);

  if (ficha.paleta.length) blocos.push(`COLOR\nUse exactly this palette: ${paletaEmLinha(ficha)}.`);

  const camera = [ficha.camera.enquadramento, ficha.camera.lente, ficha.camera.profundidade]
    .filter(Boolean)
    .join(", ");
  if (ficha.composicao || camera) {
    blocos.push(`COMPOSITION\n${[ficha.composicao, camera].filter(Boolean).join(". ")}.`);
  }

  const textos = textosOrdenados(ficha);
  if (textos.length) {
    blocos.push(
      [
        "TEXT",
        ...textos.map(linhaDeTexto),
        `Typography: headline is ${ficha.tipografia.headline || "a clean bold sans-serif"}; secondary text is ${
          ficha.tipografia.secundaria || "a legible regular sans-serif"
        }.`,
        regraDeTexto(ficha),
      ].join("\n"),
    );
  } else {
    blocos.push(`TEXT\n${regraDeTexto(ficha)}`);
  }

  if (ficha.evitar.length) blocos.push(`AVOID\n${ficha.evitar.join("; ")}.`);

  return blocos.join("\n\n");
}

// ---------------------------------------------------------------------------
// FLUX.2 — JSON nativo, hex amarrado a objeto, SEM negativo
// ---------------------------------------------------------------------------
function paraFlux(ficha: FichaCriativa, formatoDescricao: string): string {
  const textos = textosOrdenados(ficha);

  // A BFL recomenda não usar prompt negativo: o que estava em "evitar" vira
  // afirmação positiva, senão o modelo tende a desenhar justamente aquilo.
  const corpo = {
    scene: [ficha.cena, `Advertising still, ${formatoDescricao}.`].filter(Boolean).join(" "),
    subjects: [
      ficha.produtoNaCena && {
        description: ficha.produtoNaCena,
        position: "primary focal point",
        action: "presented as the hero of the composition",
      },
      ...textos.map((t) => ({
        type: "text element",
        description: `the text "${t.conteudo}" rendered exactly as written`,
        position: t.posicao || "within the composition",
        treatment: t.tratamento,
      })),
    ].filter(Boolean),
    style: [ficha.estiloFotografico, ficha.acabamento].filter(Boolean).join(", "),
    color_palette: ficha.paleta.map((c) => c.hex),
    color_match: "exact",
    color_assignments: ficha.paleta.map((c) => `${c.hex} on ${c.uso}`),
    lighting: ficha.luz,
    composition: ficha.composicao,
    typography: {
      headline: ficha.tipografia.headline,
      secondary: ficha.tipografia.secundaria,
      rule: "every string reproduced character for character, each word kept whole, no additional text anywhere in the frame",
    },
    camera: {
      angle: ficha.camera.enquadramento,
      lens: ficha.camera.lente,
      depth_of_field: ficha.camera.profundidade,
    },
    // Positivo em vez de negativo, por recomendação da própria BFL.
    quality: "sharp focus on the subject, physically accurate lighting with a single identifiable source, realistic material texture, natural asymmetry, optical depth of field",
  };

  return JSON.stringify(corpo, null, 2);
}

// ---------------------------------------------------------------------------
// Gemini / Nano Banana — instrução conversacional direta
// ---------------------------------------------------------------------------
function paraGemini(ficha: FichaCriativa, formatoDescricao: string): string {
  const textos = textosOrdenados(ficha);
  const partes: string[] = [];

  partes.push(
    `Generate a professional advertising image for social media, ${formatoDescricao}. ${ficha.estiloFotografico}.`,
  );
  if (ficha.cena) partes.push(`The scene: ${ficha.cena}`);
  if (ficha.produtoNaCena) partes.push(`The subject: ${ficha.produtoNaCena}`);
  if (ficha.luz) partes.push(`Light it like this: ${ficha.luz}`);
  if (ficha.composicao) partes.push(`Lay it out like this: ${ficha.composicao}`);
  if (ficha.paleta.length) partes.push(`Stick to this palette: ${paletaEmLinha(ficha)}.`);

  if (textos.length) {
    partes.push(
      `The image must contain exactly these text elements and nothing else:\n${textos
        .map(linhaDeTexto)
        .join("\n")}\n${regraDeTexto(ficha)}`,
    );
  } else {
    partes.push(regraDeTexto(ficha));
  }

  if (ficha.evitar.length) partes.push(`Make sure the result has none of this: ${ficha.evitar.join("; ")}.`);
  if (ficha.acabamento) partes.push(`Overall finish: ${ficha.acabamento}.`);

  return partes.join("\n\n");
}

// ---------------------------------------------------------------------------
// Ideogram — tipografia primeiro
// ---------------------------------------------------------------------------
function paraIdeogram(ficha: FichaCriativa, formatoDescricao: string): string {
  const textos = textosOrdenados(ficha);
  const partes: string[] = [];

  if (textos.length) {
    partes.push(
      `Advertising poster ${formatoDescricao} with the following text rendered exactly: ${textos
        .map((t) => `"${t.conteudo}" as the ${NOME_PAPEL[t.papel] ?? t.papel}${t.posicao ? `, ${t.posicao}` : ""}`)
        .join("; ")}.`,
    );
    partes.push(
      `Typography: ${ficha.tipografia.headline || "bold clean sans-serif"} for the headline, ${
        ficha.tipografia.secundaria || "legible sans-serif"
      } for the rest. Every word whole, no extra text.`,
    );
  } else {
    partes.push(`Advertising image ${formatoDescricao}, with no text.`);
  }

  partes.push(
    [ficha.cena, ficha.produtoNaCena, ficha.luz, ficha.composicao, ficha.estiloFotografico]
      .filter(Boolean)
      .join(". "),
  );
  if (ficha.paleta.length) partes.push(`Palette: ${paletaEmLinha(ficha)}.`);

  return partes.join("\n\n");
}

export function fichaParaPrompt(
  ficha: FichaCriativa,
  dialeto: DialetoModelo,
  formatoDescricao: string,
): string {
  switch (dialeto) {
    case "flux":
      return paraFlux(ficha, formatoDescricao);
    case "gemini":
      return paraGemini(ficha, formatoDescricao);
    case "ideogram":
      return paraIdeogram(ficha, formatoDescricao);
    case "gpt-image":
    case "generico":
    default:
      return paraGptImage(ficha, formatoDescricao);
  }
}

// Prompt negativo, para os modelos que suportam. FLUX.2 não usa.
export function negativoDaFicha(ficha: FichaCriativa): string {
  return [
    ...ficha.evitar,
    "misspelled text, broken words, extra text, watermark, logo artifacts",
    "plastic sheen, uniform flat lighting, oversaturated flat background",
    "floating particles without a source, perfect symmetry, stock photo look",
  ].join(", ");
}
