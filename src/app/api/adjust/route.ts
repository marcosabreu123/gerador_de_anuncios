import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debitarCredito, estornarCredito } from "@/lib/credits";
import { montarPromptAjuste, montarPromptAjusteGptImage } from "@/lib/ai/prompt-builder";
import { editarComFalKontext } from "@/lib/ai/fal-edit";
import { gerarVariacoes, type EntradaImagem, type TipoEntradaImagem } from "@/lib/ai/openai-image";
import { uploadImagem } from "@/lib/storage";
import { ENABLE_FLUX_EDIT, FAL_EDIT_MODEL, IMAGE_MODEL, TAMANHO_POR_FORMATO, qualidadeParaEtapa } from "@/lib/ai/models";
import { formatoMaisProximo, formatoPedidoExplicitamente, medirDimensoes } from "@/lib/image-dimensions";
import type { TipoUsoAnexoAjuste } from "@/lib/types";

export const runtime = "nodejs";
// Vercel Pro assinado — ENABLE_FLUX_EDIT=false por padrão agora (gpt-image-2,
// ~79-93s medido ao vivo). 120s dá boa folga acima disso.
export const maxDuration = 120;

interface Body {
  imageId: string; // imagem de origem a ajustar
  pedido: string; // ajuste em linguagem natural (já esclarecido pela mini conversa)
  anexoUrl?: string | null; // imagem de referência opcional anexada durante a conversa de ajuste
  tipoUsoAnexo?: TipoUsoAnexoAjuste;
}

const TIPO_ENTRADA_POR_USO_ANEXO: Record<TipoUsoAnexoAjuste, TipoEntradaImagem> = {
  logo: "logotipo",
  produto: "produto",
  fundo: "fundo",
  referencia_estilo: "referencia",
  elemento_extra: "elemento_extra",
  indefinido: "referencia",
};

async function baixarBase64(url: string, tipo: TipoEntradaImagem = "base"): Promise<EntradaImagem> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Não foi possível ler a imagem base.");
  const mimeType = res.headers.get("content-type") ?? "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType, tipo };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (!body.imageId || !body.pedido?.trim()) {
    return NextResponse.json({ error: "Informe o ajuste desejado." }, { status: 400 });
  }

  // Carrega a imagem de origem (RLS garante que é do próprio usuário).
  const { data: origem } = await supabase
    .from("images")
    .select("id, project_id, imagem_original_url, imagem_gerada_url, prompt_usado")
    .eq("id", body.imageId)
    .maybeSingle();

  if (!origem || !origem.imagem_gerada_url) {
    return NextResponse.json({ error: "Imagem base não encontrada." }, { status: 404 });
  }

  const saldo = await debitarCredito(user.id, `Ajuste: ${body.pedido.slice(0, 40)}`);
  if (saldo < 0) {
    return NextResponse.json({ error: "Você está sem créditos.", semCredito: true }, { status: 402 });
  }

  try {
    let prompt: string;
    let imagem: { base64: string; mimeType: string; promptUsado: string };
    let modeloUsado: string;

    // Flux Kontext (FAL) só aceita 1 imagem de entrada — com anexo de
    // referência, sempre usa gpt-image-2 (aceita múltiplas imagens de
    // entrada via /images/edits), independente de ENABLE_FLUX_EDIT.
    if (ENABLE_FLUX_EDIT && !body.anexoUrl) {
      // Ajuste parte da ARTE já gerada (edição), preservando identidade —
      // FAL aceita a URL da imagem diretamente, sem precisar baixar/converter.
      ({ prompt } = await montarPromptAjuste(origem.prompt_usado ?? "", body.pedido));
      imagem = await editarComFalKontext(origem.imagem_gerada_url, prompt);
      modeloUsado = FAL_EDIT_MODEL;
    } else {
      ({ prompt } = await montarPromptAjusteGptImage(origem.prompt_usado ?? "", body.pedido));
      const base = await baixarBase64(origem.imagem_gerada_url);
      const imagens = [base];
      if (body.anexoUrl) {
        const tipoAnexo = TIPO_ENTRADA_POR_USO_ANEXO[body.tipoUsoAnexo ?? "indefinido"];
        imagens.push(await baixarBase64(body.anexoUrl, tipoAnexo));
      }
      // Ajuste cirúrgico nunca muda o aspect ratio automaticamente — usa o
      // formato pedido explicitamente no texto do ajuste, senão preserva o
      // mais próximo da proporção da arte original.
      const formatoPedido = formatoPedidoExplicitamente(body.pedido);
      const dimensoes = medirDimensoes(Buffer.from(base.base64, "base64"));
      const formatoAlvo = formatoPedido ?? (dimensoes ? formatoMaisProximo(dimensoes) : null);
      const [gerada] = await gerarVariacoes({
        prompts: [prompt],
        imagens,
        tamanho: formatoAlvo ? TAMANHO_POR_FORMATO[formatoAlvo] : undefined,
        qualidade: qualidadeParaEtapa("final"),
      });
      imagem = gerada;
      modeloUsado = IMAGE_MODEL;
    }

    const urlGerada = await uploadImagem(user.id, imagem, "geradas");
    const { data: row } = await supabase
      .from("images")
      .insert({
        project_id: origem.project_id,
        user_id: user.id,
        imagem_original_url: origem.imagem_original_url,
        imagem_gerada_url: urlGerada,
        prompt_usado: prompt,
        modelo_usado: modeloUsado,
        status: "ajustada",
      })
      .select("id, imagem_gerada_url")
      .single();

    if (!row) throw new Error("Falha ao salvar o ajuste.");
    return NextResponse.json({ imagem: row, saldo });
  } catch (e) {
    await estornarCredito(user.id, "Estorno: falha no ajuste");
    const msg = e instanceof Error ? e.message : "Erro ao aplicar o ajuste.";
    console.error("[/api/adjust]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
