import { createClient } from "@supabase/supabase-js";

// Client administrativo (service_role) — SOMENTE server-side.
// Bypassa RLS. Usar apenas em operações confiáveis do backend
// (ex.: débito de créditos, provisionamento). Nunca importar em código client.
//
// A SUPABASE_SERVICE_ROLE_KEY ainda pode não estar preenchida no MVP;
// nesse caso este client lança ao ser usado, deixando o erro explícito.
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada. Gere no painel do Supabase (Settings > API) e adicione ao .env.local.",
    );
  }
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
