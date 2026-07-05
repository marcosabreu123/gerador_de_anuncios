import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { conversar } from "@/lib/ai/agente-conversa";
import type { MensagemChat } from "@/lib/types";

export const runtime = "nodejs";
// 55 (não 30): pior caso é 2 tentativas de 20s (retry automático de
// conversar(), ver src/lib/ai/completions.ts) = 40s, com folga até o teto
// rígido de 60s do plano Vercel — nunca deixa o retry ser a causa de um
// timeout que a própria função não teve chance de tratar.
export const maxDuration = 55;

interface Body {
  mensagens: MensagemChat[];
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

  if (!Array.isArray(body.mensagens) || body.mensagens.length === 0) {
    return NextResponse.json({ error: "Histórico da conversa vazio." }, { status: 400 });
  }
  // Limite defensivo — evita histórico gigante custando tokens à toa.
  const mensagens = body.mensagens.slice(-40);

  const contrato = await conversar(mensagens);
  return NextResponse.json(contrato);
}
