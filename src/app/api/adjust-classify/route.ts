import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classificarPedidoAjuste } from "@/lib/ai/prompt-builder";
import type { MensagemAjusteConversa } from "@/lib/types";

export const runtime = "nodejs";
// 35 (não 20): pior caso é 2 tentativas de 15s (retry automático de
// classificarPedidoAjuste, ver src/lib/ai/completions.ts) = 30s, com folga.
export const maxDuration = 35;

// Roda 1 turno da mini conversa de ajuste (ver AjusteConversa.tsx): recebe o
// histórico até aqui (incluindo a mensagem mais recente do usuário) e decide
// se já está claro o suficiente pra confirmar a geração ou se precisa
// perguntar antes. Não gasta crédito de imagem — crédito só é descontado
// quando o usuário confirma a geração (/api/adjust, /api/edit-design etc).

interface Body {
  historico: MensagemAjusteConversa[];
  temAnexo?: boolean;
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
  const ultimo = Array.isArray(body.historico) ? body.historico[body.historico.length - 1] : null;
  if (!ultimo || ultimo.role !== "user" || !ultimo.content?.trim()) {
    return NextResponse.json({ error: "Descreva o que você quer mudar." }, { status: 400 });
  }

  const classificacao = await classificarPedidoAjuste(body.historico, body.temAnexo === true);
  return NextResponse.json(classificacao);
}
