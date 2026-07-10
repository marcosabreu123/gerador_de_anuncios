import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debitarCredito, estornarCredito } from "@/lib/credits";
import { montarPrompt, montarPromptMelhorarArteExistente } from "@/lib/ai/prompt-builder";
import { gerarVariacoes, type EntradaImagem } from "@/lib/ai/openai-image";
import { uploadImagem } from "@/lib/storage";
import { IMAGE_MODEL, TAMANHO_POR_FORMATO, qualidadeParaEtapa } from "@/lib/ai/models";
import { formatoMaisProximo, formatoPedidoExplicitamente, medirDimensoes } from "@/lib/image-dimensions";
import type {
  BriefingCompleto,
  DirecaoTransformacao,
  Formato,
  ImagemAnexo,
  ModoTransformacao,
  TipoFluxo,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Gera mais uma variação do MESMO projeto/briefing (não um ajuste pontual):
// reaproveita o briefing e as imagens anexadas originalmente, monta um novo
// prompt do zero (temperature 0.8 no prompt-builder já garante uma releitura
// criativa diferente) e gera 1 imagem nova, 1 crédito.

interface Body {
  projectId: string;
}

async function baixarBase64(img: ImagemAnexo): Promise<EntradaImagem> {
  const res = await fetch(img.url);
  if (!res.ok) throw new Error(`Não foi possível ler a imagem (${img.tipo}).`);
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType, tipo: img.tipo };
}

function resolverFormato(valor: unknown): Formato | null {
  return valor === "story-9-16" || valor === "feed-4-5" || valor === "quadrado-1-1" ? valor : null;
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
  if (!body.projectId) {
    return NextResponse.json({ error: "Informe o projeto." }, { status: 400 });
  }

  const { data: projeto } = await supabase
    .from("projects")
    .select("id, user_id, formato, conversa")
    .eq("id", body.projectId)
    .maybeSingle();

  if (!projeto || projeto.user_id !== user.id) {
    return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 });
  }

  const conversa = (projeto.conversa ?? {}) as {
    tipoFluxo?: TipoFluxo;
    briefing?: BriefingCompleto;
    imagens?: ImagemAnexo[];
    imagemOriginal?: string;
    modoTransformacao?: ModoTransformacao;
    direcao?: DirecaoTransformacao;
    instrucaoUsuario?: string;
  };

  // Fluxo "transformar arte existente" não tem briefing — reaplica o mesmo
  // prompt-builder sobre a mesma arte original enviada.
  const ehArteExistente = conversa.tipoFluxo === "transformar_arte_existente";

  if (ehArteExistente) {
    if (!conversa.imagemOriginal || !conversa.modoTransformacao) {
      return NextResponse.json({ error: "Arte original não encontrada." }, { status: 400 });
    }
    const saldo = await debitarCredito(user.id, "Nova variação");
    if (saldo < 0) {
      return NextResponse.json({ error: "Você está sem créditos.", semCredito: true }, { status: 402 });
    }
    try {
      const { prompt } = await montarPromptMelhorarArteExistente({
        modoTransformacao: conversa.modoTransformacao,
        direcao: conversa.direcao,
        instrucaoUsuario: conversa.instrucaoUsuario,
      });
      const base = await baixarBase64({ tipo: "produto", url: conversa.imagemOriginal });
      // Regra global de formato: nunca muda o aspect ratio automaticamente —
      // usa o formato pedido explicitamente, senão preserva o mais próximo
      // da proporção da arte original (mesma lógica de /api/melhorar-arte).
      const bufOriginal = Buffer.from(base.base64, "base64");
      const formatoPedido = formatoPedidoExplicitamente(conversa.instrucaoUsuario);
      const dimensoes = medirDimensoes(bufOriginal);
      const formatoAlvo = formatoPedido ?? (dimensoes ? formatoMaisProximo(dimensoes) : null);
      const [imagem] = await gerarVariacoes({
        prompts: [prompt],
        imagens: [base],
        tamanho: formatoAlvo ? TAMANHO_POR_FORMATO[formatoAlvo] : undefined,
        qualidade: qualidadeParaEtapa("rascunho"),
      });

      const urlGerada = await uploadImagem(user.id, imagem, "geradas");
      const { data: row } = await supabase
        .from("images")
        .insert({
          project_id: projeto.id,
          user_id: user.id,
          imagem_original_url: conversa.imagemOriginal,
          imagem_gerada_url: urlGerada,
          prompt_usado: imagem.promptUsado,
          modelo_usado: IMAGE_MODEL,
          status: "gerada",
        })
        .select("id, imagem_gerada_url")
        .single();
      if (!row) throw new Error("Falha ao salvar a nova variação.");
      return NextResponse.json({ imagem: row, saldo });
    } catch (e) {
      await estornarCredito(user.id, "Estorno: falha na nova variação");
      const msg = e instanceof Error ? e.message : "Erro ao gerar nova variação.";
      console.error("[/api/generate-variation]", e);
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const briefing = conversa.briefing;
  if (!briefing) {
    return NextResponse.json({ error: "Briefing original não encontrado." }, { status: 400 });
  }

  const saldo = await debitarCredito(user.id, "Nova variação");
  if (saldo < 0) {
    return NextResponse.json({ error: "Você está sem créditos.", semCredito: true }, { status: 402 });
  }

  try {
    const imagensAnexadas = conversa.imagens ?? [];
    const entradas = await Promise.all(imagensAnexadas.map(baixarBase64));
    const { prompts } = await montarPrompt(briefing);
    const formato =
      resolverFormato(projeto.formato) ??
      resolverFormato((briefing as { formato?: unknown }).formato) ??
      "quadrado-1-1";
    const qualidade = qualidadeParaEtapa("rascunho");

    const imagens = await gerarVariacoes({
      prompts,
      imagens: entradas,
      tamanho: TAMANHO_POR_FORMATO[formato],
      qualidade,
    });

    const urlProduto = imagensAnexadas.find((i) => i.tipo === "produto")?.url ?? null;
    const urlGerada = await uploadImagem(user.id, imagens[0], "geradas");
    const { data: row } = await supabase
      .from("images")
      .insert({
        project_id: projeto.id,
        user_id: user.id,
        imagem_original_url: urlProduto,
        imagem_gerada_url: urlGerada,
        prompt_usado: imagens[0].promptUsado,
        modelo_usado: IMAGE_MODEL,
        status: "gerada",
      })
      .select("id, imagem_gerada_url")
      .single();

    if (!row) throw new Error("Falha ao salvar a nova variação.");
    return NextResponse.json({ imagem: row, saldo });
  } catch (e) {
    await estornarCredito(user.id, "Estorno: falha na nova variação");
    const msg = e instanceof Error ? e.message : "Erro ao gerar nova variação.";
    console.error("[/api/generate-variation]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
