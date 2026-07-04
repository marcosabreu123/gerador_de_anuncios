import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

interface Body {
  userId: string;
  quantidade: number;
}

// Concede créditos a outro usuário. Só quem tem is_admin = true consegue —
// checado aqui (defesa em profundidade) E dentro da função SQL
// adicionar_credito, que usa auth.uid() da sessão (não confia em parâmetro
// vindo do cliente) para verificar admin de novo antes de gravar.
export async function POST(request: NextRequest) {
  const { perfil } = await requireUser();
  if (!perfil.is_admin) {
    return NextResponse.json({ error: "Apenas administradores podem fazer isso." }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (!body.userId || !Number.isInteger(body.quantidade) || body.quantidade === 0) {
    return NextResponse.json({ error: "Informe o usuário e a quantidade de créditos." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: novoSaldo, error } = await supabase.rpc("adicionar_credito", {
    p_user: body.userId,
    p_quantidade: body.quantidade,
    p_motivo: `Créditos adicionados por ${perfil.email}`,
  });

  if (error) {
    console.error("[/api/admin/add-credit]", error);
    return NextResponse.json({ error: "Falha ao adicionar créditos." }, { status: 500 });
  }

  return NextResponse.json({ saldo: novoSaldo });
}
