import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debitarCredito, estornarCredito } from "@/lib/credits";
import { montarPromptMelhorarArteExistente } from "@/lib/ai/prompt-builder";
import { gerarVariacoes } from "@/lib/ai/openai-image";
import { uploadImagem } from "@/lib/storage";
import { IMAGE_MODEL, TAMANHO_POR_FORMATO, qualidadeParaEtapa } from "@/lib/ai/models";
import { formatoMaisProximo, formatoPedidoExplicitamente, medirDimensoes } from "@/lib/image-dimensions";
import type { DirecaoTransformacao, ModoTransformacao } from "@/lib/types";

export const runtime = "nodejs";
// Gera com gpt-image-2 a partir de 1 imagem de entrada (a arte enviada) —
// mesma classe de chamada do /api/generate com foto de produto, ~30-40s
// medido ao vivo. Sempre gpt-image-2 aqui (não é o fluxo de ajuste
// cirúrgico, então não depende de ENABLE_FLUX_EDIT).
export const maxDuration = 90;

// Fluxo rápido "transformar arte existente" (melhorar OU criar nova
// versão): o lojista já tem uma arte pronta (feita aqui ou fora do app) e
// só quer uma versão nova/melhorada dela, sem passar pelo briefing
// completo. Diferente do ajuste cirúrgico (/api/adjust, que já cobre
// trocar um detalhe específico): aqui o objetivo é uma peça nova ou
// melhorada inspirada na enviada, nunca uma mudança pontual.

interface Body {
  imagemOriginal: string;
  modoTransformacao: ModoTransformacao;
  direcao?: DirecaoTransformacao;
  instrucaoUsuario?: string;
}

async function baixarImagem(url: string): Promise<{ base64: string; mimeType: string; tipo: "base"; buf: Buffer }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Não foi possível ler a arte enviada.");
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType, tipo: "base", buf };
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
  if (!body.imagemOriginal || !body.modoTransformacao) {
    return NextResponse.json({ error: "Envie a arte e escolha o que quer fazer com ela." }, { status: 400 });
  }

  const nomeProjeto =
    body.modoTransformacao === "melhoria_recompositiva" ? "Melhoria de arte existente" : "Nova versão de arte";

  const saldo = await debitarCredito(user.id, nomeProjeto);
  if (saldo < 0) {
    return NextResponse.json({ error: "Você está sem créditos.", semCredito: true }, { status: 402 });
  }

  try {
    const { prompt } = await montarPromptMelhorarArteExistente({
      modoTransformacao: body.modoTransformacao,
      direcao: body.direcao,
      instrucaoUsuario: body.instrucaoUsuario,
    });
    const { buf, ...base } = await baixarImagem(body.imagemOriginal);
    // Regra global de formato: nunca muda o aspect ratio automaticamente —
    // usa o formato pedido explicitamente (ex.: "transforma em feed") se
    // houver, senão preserva o mais próximo da proporção da arte original.
    const formatoPedido = formatoPedidoExplicitamente(body.instrucaoUsuario);
    const dimensoes = medirDimensoes(buf);
    const formatoAlvo = formatoPedido ?? (dimensoes ? formatoMaisProximo(dimensoes) : null);
    const [imagem] = await gerarVariacoes({
      prompts: [prompt],
      imagens: [base],
      tamanho: formatoAlvo ? TAMANHO_POR_FORMATO[formatoAlvo] : undefined,
      qualidade: qualidadeParaEtapa("rascunho"),
    });

    const { data: projeto, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        nome_projeto: nomeProjeto,
        tipo_arte: nomeProjeto,
        status: "concluido",
        conversa: {
          tipoFluxo: "transformar_arte_existente",
          imagemOriginal: body.imagemOriginal,
          modoTransformacao: body.modoTransformacao,
          direcao: body.direcao ?? null,
          instrucaoUsuario: body.instrucaoUsuario ?? null,
        },
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
        imagem_original_url: body.imagemOriginal,
        imagem_gerada_url: urlGerada,
        prompt_usado: imagem.promptUsado,
        modelo_usado: IMAGE_MODEL,
        status: "gerada",
      })
      .select("id, imagem_gerada_url")
      .single();
    if (!row) throw new Error("Falha ao salvar a arte gerada.");

    return NextResponse.json({ projectId: projeto.id, saldo });
  } catch (e) {
    await estornarCredito(user.id, "Estorno: falha ao transformar arte");
    const msg = e instanceof Error ? e.message : "Erro ao gerar a nova versão.";
    console.error("[/api/melhorar-arte]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
