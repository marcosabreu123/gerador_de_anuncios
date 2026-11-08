import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { TipoReferencia } from "@/lib/agencia/types";

export const runtime = "nodejs";

const TIPOS_VALIDOS: TipoReferencia[] = ["logo", "produto", "arte_aprovada", "referencia_visual", "logo_parceiro"];

// Registra um material já enviado ao Storage pelo navegador (ver
// UploadMaterial). Rota em vez de Server Action porque o upload acontece no
// cliente e precisa de uma resposta para saber se deu certo antes de limpar
// o formulário.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: perfil } = await supabase
    .from("users")
    .select("papel, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!perfil?.ativo || (perfil.papel !== "socio" && perfil.papel !== "colaborador")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  let body: { clienteId?: string; tipo?: string; url?: string; descricao?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const tipo = (body.tipo ?? "referencia_visual") as TipoReferencia;
  if (!body.clienteId || !body.url) {
    return NextResponse.json({ error: "Dados incompletos." }, { status: 400 });
  }
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return NextResponse.json({ error: "Tipo de material inválido." }, { status: 400 });
  }
  // Sem o nome, a logo de parceiro nunca seria acionada (ver logo-parceiro.ts).
  if (tipo === "logo_parceiro" && !body.descricao?.trim()) {
    return NextResponse.json({ error: "Escreva o nome que aciona a logo." }, { status: 400 });
  }

  const { error } = await supabase.from("referencias").insert({
    cliente_id: body.clienteId,
    tipo,
    url: body.url,
    descricao: body.descricao?.trim() || null,
  });

  if (error) {
    console.error("[/api/referencias]", error);
    return NextResponse.json({ error: "Falha ao registrar o material." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
