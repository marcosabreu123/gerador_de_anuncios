import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debitarCredito, estornarCredito } from "@/lib/credits";
import { montarPromptAjuste } from "@/lib/ai/prompt-builder";
import { gerarVariacoes } from "@/lib/ai/gemini";
import { uploadImagem } from "@/lib/storage";
import { modeloParaEtapa } from "@/lib/ai/models";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  imageId: string; // imagem de origem a ajustar
  pedido: string; // ajuste em linguagem natural
}

async function baixarBase64(url: string): Promise<{ base64: string; mimeType: string; tipo: "base" }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Não foi possível ler a imagem base.");
  const mimeType = res.headers.get("content-type") ?? "image/png";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType, tipo: "base" };
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
    // Reinterpreta o pedido combinando com o prompt anterior.
    const { prompt } = await montarPromptAjuste(origem.prompt_usado ?? "", body.pedido);

    // Ajuste parte da ARTE já gerada (edição), preservando identidade.
    const base = await baixarBase64(origem.imagem_gerada_url);
    const modelo = modeloParaEtapa("final"); // final = pro (melhor legibilidade de texto)

    const imagens = await gerarVariacoes({
      prompts: [prompt],
      imagens: [base],
      modelo,
    });

    const urlGerada = await uploadImagem(user.id, imagens[0], "geradas");
    const { data: row } = await supabase
      .from("images")
      .insert({
        project_id: origem.project_id,
        user_id: user.id,
        imagem_original_url: origem.imagem_original_url,
        imagem_gerada_url: urlGerada,
        prompt_usado: prompt,
        modelo_usado: modelo,
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
