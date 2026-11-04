import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { contatosParaInstrucao, identidadeParaInstrucao } from "@/lib/ai/agente-pedido";
import { melhorarIdeia } from "@/lib/ai/melhorar-ideia";
import { TEXT_PROMPT_BUILDER_MODEL } from "@/lib/ai/models";
import { custoTextoUSD, registrarGeracao } from "@/lib/agencia/custo";
import { transcreverPedido } from "@/lib/agencia/transcricao";
import type { BrandKit, Cliente } from "@/lib/agencia/types";

export const runtime = "nodejs";
export const maxDuration = 120;

// Devolve o briefing sugerido para a ideia do operador, em texto ou áudio.
//
// Não cria pedido nem consome pacote: o que vale é o texto que ele aprovar e
// mandar gerar em /api/geracoes/criar. O custo da chamada entra no rateio do
// cliente como qualquer outra chamada de API.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Gasta API: mesma exigência de /api/geracoes/criar.
  const { data: perfil } = await supabase
    .from("users")
    .select("papel, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.ativo || (perfil.papel !== "socio" && perfil.papel !== "colaborador")) {
    return NextResponse.json({ error: "Sem permissão para gerar." }, { status: 403 });
  }

  let clienteId = "";
  let ideia = "";
  let anterior: string | undefined;
  let audio: File | null = null;

  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      clienteId = String(form.get("clienteId") ?? "");
      ideia = String(form.get("ideia") ?? "");
      const arquivo = form.get("audio");
      if (arquivo instanceof File && arquivo.size > 0) audio = arquivo;
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      clienteId = String(body.clienteId ?? "");
      ideia = String(body.ideia ?? "");
      anterior = (body.anterior as string) || undefined;
    }
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (!clienteId) return NextResponse.json({ error: "Informe o cliente." }, { status: 400 });
  if (!ideia.trim() && !audio) {
    return NextResponse.json({ error: "Escreva ou grave a ideia primeiro." }, { status: 400 });
  }

  const { data: clienteRaw } = await supabase.from("clientes").select("*").eq("id", clienteId).maybeSingle();
  if (!clienteRaw) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
  const cliente = clienteRaw as Cliente;
  if (!cliente.ativo) {
    return NextResponse.json(
      { error: "Este cliente está arquivado. Reative antes de produzir." },
      { status: 409 },
    );
  }

  const { data: brandKitRaw } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("cliente_id", clienteId)
    .maybeSingle();
  const brandKit = (brandKitRaw as BrandKit) ?? null;

  if (audio) {
    try {
      // Soma ao que já estava digitado: o operador pode ter começado escrevendo.
      ideia = [ideia.trim(), await transcreverPedido(audio, clienteId)].filter(Boolean).join("\n");
    } catch (e) {
      console.error("[/api/geracoes/melhorar-ideia] transcrição:", e);
      return NextResponse.json({ error: "Não consegui ouvir o áudio. Tente de novo ou digite a ideia." }, { status: 502 });
    }
    if (!ideia.trim()) {
      return NextResponse.json({ error: "Não entendi o áudio. Tente de novo ou digite a ideia." }, { status: 400 });
    }
  }

  const inicio = Date.now();
  try {
    const { briefing, faltou, avisos, uso } = await melhorarIdeia({
      ideia,
      identidade: identidadeParaInstrucao(cliente, brandKit),
      contatos: contatosParaInstrucao(brandKit),
      anterior,
    });

    await registrarGeracao({
      tipo: "texto",
      modelo: uso.modelo,
      custoUsd: custoTextoUSD(uso.modelo, uso.entrada, uso.saida),
      usageRaw: { entrada: uso.entrada, saida: uso.saida, estimado: false },
      duracaoMs: Date.now() - inicio,
      clienteId,
    });

    return NextResponse.json({ ideia, briefing, faltou, avisos });
  } catch (e) {
    console.error("[/api/geracoes/melhorar-ideia]", e);
    // Falha também custa. Sem usage na resposta, estima pelo consumo medido.
    await registrarGeracao({
      tipo: "texto",
      modelo: TEXT_PROMPT_BUILDER_MODEL,
      custoUsd: custoTextoUSD(TEXT_PROMPT_BUILDER_MODEL, 1800, 250),
      usageRaw: { estimado: true },
      duracaoMs: Date.now() - inicio,
      sucesso: false,
      erro: e instanceof Error ? e.message : String(e),
      clienteId,
    });
    // A ideia volta junto: se veio de áudio, a transcrição não pode se perder.
    return NextResponse.json(
      { error: "Não consegui melhorar agora. Você pode gerar com o seu texto.", ideia },
      { status: 500 },
    );
  }
}
