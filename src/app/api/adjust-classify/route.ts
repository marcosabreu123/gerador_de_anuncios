import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classificarPedidoAjuste } from "@/lib/ai/prompt-builder";

export const runtime = "nodejs";
// 35 (não 20): pior caso é 2 tentativas de 15s (retry automático de
// classificarPedidoAjuste, ver src/lib/ai/completions.ts) = 30s, com folga.
export const maxDuration = 35;

// Classifica um pedido em linguagem natural sobre uma arte já gerada: ajuste
// pontual (chamar /api/adjust) ou mudança grande / nova criação disfarçada.
// Não gasta crédito de imagem — só um turno de conversa, e roda ANTES da
// confirmação que o usuário vê na tela de resultado.

interface Body {
  pedido: string;
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
  if (!body.pedido?.trim()) {
    return NextResponse.json({ error: "Descreva o que você quer mudar." }, { status: 400 });
  }

  const classificacao = await classificarPedidoAjuste(body.pedido);
  return NextResponse.json(classificacao);
}
