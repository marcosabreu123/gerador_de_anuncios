import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { debitarCredito, estornarCredito } from "@/lib/credits";
import { montarPrompt } from "@/lib/ai/prompt-builder";
import { gerarVariacoes } from "@/lib/ai/gemini";
import { uploadImagem } from "@/lib/storage";
import { modeloParaEtapa } from "@/lib/ai/models";
import { normalizarBriefing } from "@/lib/ai/normalizar-briefing";
import {
  ESTILOS,
  FORMATOS,
  TIPOS_PECA,
  type BriefingCompleto,
  type Estilo,
  type Formato,
  type MensagemChat,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const VARIACOES = 2;

interface Body {
  originalUrl?: string; // ausente quando temFotoProduto = false
  briefing: BriefingCompleto;
  mensagens?: MensagemChat[]; // transcrição da conversa, para auditoria/depuração
}

// Baixa a foto original do produto e converte para base64 (para enviar ao Gemini).
async function baixarBase64(url: string): Promise<{ base64: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Não foi possível ler a foto do produto.");
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const buf = Buffer.from(await res.arrayBuffer());
  return { base64: buf.toString("base64"), mimeType };
}

// Validação mínima no servidor — o agente conversacional já garante o
// preenchimento completo antes de liberar o botão "Gerar" no front, mas a
// API nunca confia só nisso.
function validar(b: BriefingCompleto | undefined): b is BriefingCompleto {
  if (!b) return false;
  if (!b.nomeProduto?.trim()) return false;
  if (!(b.tipoPeca in TIPOS_PECA)) return false;
  if (!(b.formato in FORMATOS)) return false;
  if (!(b.estilo in ESTILOS)) return false;
  if (!b.frase?.trim()) return false; // precisa estar resolvida (usuário ou IA aprovada)
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
  // originalUrl só é obrigatório quando o lojista de fato enviou uma foto.
  if (body.briefing.temFotoProduto && !body.originalUrl) {
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
    const produto = body.originalUrl ? await baixarBase64(body.originalUrl) : undefined;
    const { prompt } = await montarPrompt(body.briefing);
    const modelo = modeloParaEtapa("rascunho"); // rascunho = flash (barato/rápido)

    // 3) Gera variações no Gemini.
    const imagens = await gerarVariacoes({
      prompt,
      produto,
      modelo,
      variacoes: VARIACOES,
    });

    // 4) Cria o projeto (guarda a transcrição da conversa para auditoria).
    const formato = body.briefing.formato as Formato;
    const estilo = body.briefing.estilo as Estilo;
    const { data: projeto, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        nome_projeto: body.briefing.nomeProduto,
        tipo_arte: ESTILOS[estilo].label,
        formato,
        status: "concluido",
        conversa: { briefing: body.briefing, mensagens: body.mensagens ?? [] },
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
          imagem_original_url: body.originalUrl ?? null,
          imagem_gerada_url: urlGerada,
          prompt_usado: prompt,
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
