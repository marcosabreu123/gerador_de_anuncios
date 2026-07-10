import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debitarCredito, estornarCredito } from "@/lib/credits";
import { montarPromptEdicaoDireta, montarPromptEdicaoDiretaGptImage } from "@/lib/ai/prompt-builder";
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

// Fluxo "editar um design existente": o lojista sobe uma arte pronta (feita
// fora do app) e pede uma mudança em texto livre — sem passar pela conversa
// guiada de briefing. Gera 1 variação por 1 crédito (mesma regra do ajuste).

interface Body {
  originalUrl: string; // design existente enviado pelo usuário
  pedido: string; // o que ele quer mudar (já esclarecido pela mini conversa)
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
  if (!res.ok) throw new Error("Não foi possível ler o design enviado.");
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
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
  if (!body.originalUrl || !body.pedido?.trim()) {
    return NextResponse.json({ error: "Envie o design e descreva o que quer mudar." }, { status: 400 });
  }

  const saldo = await debitarCredito(user.id, `Edição: ${body.pedido.slice(0, 40)}`);
  if (saldo < 0) {
    return NextResponse.json({ error: "Você está sem créditos.", semCredito: true }, { status: 402 });
  }

  try {
    let prompt: string;
    let imagem: { base64: string; mimeType: string; promptUsado: string };
    let modeloUsado: string;

    // Flux Kontext (FAL) só aceita 1 imagem de entrada — com anexo de
    // referência, sempre usa gpt-image-2, independente de ENABLE_FLUX_EDIT.
    if (ENABLE_FLUX_EDIT && !body.anexoUrl) {
      ({ prompt } = await montarPromptEdicaoDireta(body.pedido));
      imagem = await editarComFalKontext(body.originalUrl, prompt);
      modeloUsado = FAL_EDIT_MODEL;
    } else {
      ({ prompt } = await montarPromptEdicaoDiretaGptImage(body.pedido));
      const base = await baixarBase64(body.originalUrl);
      const imagens = [base];
      if (body.anexoUrl) {
        const tipoAnexo = TIPO_ENTRADA_POR_USO_ANEXO[body.tipoUsoAnexo ?? "indefinido"];
        imagens.push(await baixarBase64(body.anexoUrl, tipoAnexo));
      }
      // Ajuste cirúrgico nunca muda o aspect ratio automaticamente — usa o
      // formato pedido explicitamente no texto do pedido, senão preserva o
      // mais próximo da proporção do design original.
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

    const { data: projeto, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        nome_projeto: "Edição de design",
        tipo_arte: "Edição de design",
        status: "concluido",
        conversa: { pedido: body.pedido },
      })
      .select("id")
      .single();
    if (projErr || !projeto) throw new Error("Falha ao criar o projeto.");

    const urlGerada = await uploadImagem(user.id, imagem, "geradas");
    const { data: row } = await supabase
      .from("images")
      .insert({
        project_id: projeto.id,
        user_id: user.id,
        imagem_original_url: body.originalUrl,
        imagem_gerada_url: urlGerada,
        prompt_usado: prompt,
        modelo_usado: modeloUsado,
        status: "gerada",
      })
      .select("id, imagem_gerada_url")
      .single();
    if (!row) throw new Error("Falha ao salvar a edição.");

    return NextResponse.json({ projectId: projeto.id, saldo });
  } catch (e) {
    await estornarCredito(user.id, "Estorno: falha na edição");
    const msg = e instanceof Error ? e.message : "Erro ao editar o design.";
    console.error("[/api/edit-design]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
