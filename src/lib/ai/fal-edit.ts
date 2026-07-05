import { FAL_EDIT_MODEL } from "./models";

// Edição de imagem via FAL.ai (Flux Kontext Pro) — usada nos fluxos que
// editam uma arte JÁ PRONTA (texto+logo+foto): ajuste pontual (/api/adjust)
// e edição direta de design (/api/edit-design). Medido ao vivo: editar essa
// mesma classe de imagem via gpt-image-2 (/images/edits) levava 79-93s,
// mesmo em qualidade baixa — Flux Kontext Pro faz a mesma edição em ~13s,
// com boa fidelidade aos elementos não pedidos (é um modelo feito
// especificamente para edição por instrução, não para composição do zero).
// A API aceita a URL da imagem diretamente — não precisa baixar/converter
// pra base64 antes de enviar (diferença vs. o fluxo com a OpenAI).

export interface ImagemEditada {
  base64: string;
  mimeType: string;
  promptUsado: string;
}

interface FalImagemResultado {
  url: string;
  content_type?: string;
}

interface FalResultado {
  images?: FalImagemResultado[];
}

function getFalKey(): string {
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY não configurada. Adicione ao .env.local para editar artes.");
  return key;
}

export async function editarComFalKontext(imageUrl: string, prompt: string): Promise<ImagemEditada> {
  const falKey = getFalKey();

  const res = await fetch(`https://fal.run/${FAL_EDIT_MODEL}`, {
    method: "POST",
    headers: {
      Authorization: `Key ${falKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      image_url: imageUrl,
      output_format: "png",
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`Falha na edição de imagem (${res.status}): ${texto.slice(0, 300)}`);
  }

  const json = (await res.json()) as FalResultado;
  const imagemUrl = json.images?.[0]?.url;
  if (!imagemUrl) throw new Error("O serviço de edição não retornou nenhuma imagem.");

  const imgRes = await fetch(imagemUrl);
  if (!imgRes.ok) throw new Error("Falha ao baixar a imagem editada.");
  const mimeType = imgRes.headers.get("content-type") ?? "image/png";
  const buf = Buffer.from(await imgRes.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType, promptUsado: prompt };
}
