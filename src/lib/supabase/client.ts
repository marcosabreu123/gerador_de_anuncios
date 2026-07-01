import { createBrowserClient } from "@supabase/ssr";

// Client para uso em Client Components (browser). Usa apenas a anon key pública.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
