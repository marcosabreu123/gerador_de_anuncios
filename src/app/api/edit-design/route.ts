import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debitarCredito, estornarCredito } from "@/lib/credits";
import { montarPromptEdicaoDireta } from "@/lib/ai/prompt-builder";
import { editarComFalKontext } from "@/lib/ai/fal-edit";
import { uploadImagem } from "@/lib/storage";
import { FAL_EDIT_MODEL } from "@/lib/ai/models";

export const runtime = "nodejs";
// FAL Kontext Pro edita em ~13-20s (vs. 79-93s do gpt-image-2 pra essa mesma
// classe de edição) — 30s dá boa folga sem chegar perto do teto de 60s.
export const maxDuration = 30;

// Fluxo "editar um design existente": o lojista sobe uma arte pronta (feita
// fora do app) e pede uma mudança em texto livre — sem passar pela conversa
// guiada de briefing. Gera 1 variação por 1 crédito (mesma regra do ajuste).

interface Body {
  originalUrl: string; // design existente enviado pelo usuário
  pedido: string; // o que ele quer mudar
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
    const { prompt } = await montarPromptEdicaoDireta(body.pedido);
    const imagem = await editarComFalKontext(body.originalUrl, prompt);

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
        modelo_usado: FAL_EDIT_MODEL,
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
