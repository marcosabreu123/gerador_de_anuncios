import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

// Next 16: convenção "middleware" foi renomeada para "proxy".
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Roda em tudo, menos estáticos e imagens.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
