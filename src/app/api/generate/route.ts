import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debitarCredito, estornarCredito } from "@/lib/credits";
import { montarPrompt } from "@/lib/ai/prompt-builder";
import { gerarVariacoes, type EntradaImagem } from "@/lib/ai/gemini";
import { uploadImagem } from "@/lib/storage";
import { modeloParaEtapa } from "@/lib/ai/models";
import { normalizarBriefing } from "@/lib/ai/normalizar-briefing";
import {
  ESTILOS,
  FORMATOS,
  TIPOS_PECA,
  type BriefingCompleto,
  type Formato,
  type ImagemAnexo,
  type MensagemChat,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

interface Body {
  imagens?: ImagemAnexo[]; // fotos de produto/referência/logotipo anexadas na conversa
  briefing: BriefingCompleto;
  mensagens?: MensagemChat[]; // transcrição da conversa, para auditoria/depuração
}

// Baixa uma imagem anexada e converte para base64 (para enviar ao Gemini).
async function baixarBase64(img: ImagemAnexo): Promise<EntradaImagem> {
  const res = await fetch(img.url);
  if (!res.ok) throw new Error(`Não foi possível ler a imagem (${img.tipo}).`);
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType, tipo: img.tipo };
}

// Validação mínima no servidor — o agente conversacional já garante o
// preenchimento completo antes de liberar o botão "Gerar" no front, mas a
// API nunca confia só nisso.
function validar(b: BriefingCompleto | undefined): b is BriefingCompleto {
  if (!b) return false;
  if (!b.nomeProduto?.trim()) return false;
  if (!(b.tipoPeca in TIPOS_PECA)) return false;
  if (!(b.formato in FORMATOS)) return false;
  // Estilo é híbrido: preset válido, OU "estilo-livre" com o texto preenchido.
  const estiloOk =
    (b.estiloVisual && b.estiloVisual !== "estilo-livre" && b.estiloVisual in ESTILOS) ||
    (b.estiloVisual === "estilo-livre" && !!b.estiloLivre?.trim());
  if (!estiloOk) return false;
  // Conteúdo precisa estar organizado e ter ao menos a chamada principal.
  if (!b.conteudoAnuncio?.headline?.trim()) return false;
  return true;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  // O agente conversacional às vezes devolve o label em português (ex:
  // "Story") em vez da chave interna ("story") — normaliza antes de validar.
  if (body.briefing) {
    body.briefing = { ...body.briefing, ...normalizarBriefing(body.briefing) } as BriefingCompleto;
  }

  if (!validar(body.briefing)) {
    return NextResponse.json({ error: "Dados do briefing incompletos." }, { status: 400 });
  }
  const imagensAnexadas = body.imagens ?? [];
  // Foto do produto só é obrigatória quando o lojista de fato disse que tinha uma.
  if (body.briefing.temFotoProduto && !imagensAnexadas.some((i) => i.tipo === "produto")) {
    return NextResponse.json({ error: "Foto do produto não encontrada." }, { status: 400 });
  }

  // 1) Debita crédito ANTES de gerar (atômico). Estorna se falhar.
  const saldo = await debitarCredito(user.id, `Geração: ${body.briefing.nomeProduto}`);
  if (saldo < 0) {
    return NextResponse.json(
      { error: "Você está sem créditos.", semCredito: true },
      { status: 402 },
    );
  }

  try {
    // 2) Prepara insumos. Foto é opcional — sem ela, o Gemini compõe do zero.
    const entradas = await Promise.all(imagensAnexadas.map(baixarBase64));
    const { prompts } = await montarPrompt(body.briefing);
    const modelo = modeloParaEtapa("rascunho"); // rascunho = flash (barato/rápido)

    // 3) Gera as variações no Gemini — uma por direção criativa distinta.
    const imagens = await gerarVariacoes({
      prompts,
      imagens: entradas,
      modelo,
    });

    // 4) Cria o projeto (guarda a transcrição da conversa + anexos para auditoria).
    const formato = body.briefing.formato as Formato;
    const tipoArte =
      body.briefing.estiloVisual && body.briefing.estiloVisual !== "estilo-livre"
        ? ESTILOS[body.briefing.estiloVisual].label
        : (body.briefing.estiloLivre ?? "Personalizado");
    const urlProduto = imagensAnexadas.find((i) => i.tipo === "produto")?.url ?? null;
    const { data: projeto, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        nome_projeto: body.briefing.nomeProduto,
        tipo_arte: tipoArte,
        formato,
        status: "concluido",
        conversa: { briefing: body.briefing, mensagens: body.mensagens ?? [], imagens: imagensAnexadas },
      })
      .select("id")
      .single();
    if (projErr || !projeto) throw new Error("Falha ao criar o projeto.");

    // 5) Sobe cada variação e registra em images.
    const criadas = [];
    for (const img of imagens) {
      const urlGerada = await uploadImagem(user.id, img, "geradas");
      const { data: row } = await supabase
        .from("images")
        .insert({
          project_id: projeto.id,
          user_id: user.id,
          imagem_original_url: urlProduto,
          imagem_gerada_url: urlGerada,
          prompt_usado: img.promptUsado,
          modelo_usado: modelo,
          status: "gerada",
        })
        .select("id, imagem_gerada_url")
        .single();
      if (row) criadas.push(row);
    }

    if (criadas.length === 0) throw new Error("Nenhuma variação foi salva.");

    return NextResponse.json({
      projectId: projeto.id,
      imagens: criadas,
      saldo,
    });
  } catch (e) {
    // Estorna o crédito, já que a geração não entregou resultado.
    await estornarCredito(user.id, "Estorno: falha na geração");
    const msg = e instanceof Error ? e.message : "Erro ao gerar a arte.";
    console.error("[/api/generate]", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
