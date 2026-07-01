import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="app-shell flex-1 flex flex-col justify-center py-16">
      <div className="text-center">
        <span className="inline-block text-xs font-semibold tracking-wide uppercase text-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1 rounded-full">
          Para lojistas
        </span>
        <h1 className="text-3xl font-bold tracking-tight mt-5 leading-tight">
          Crie anúncios profissionais para seus produtos em poucos cliques
        </h1>
        <p className="text-[var(--muted)] mt-4">
          Transforme fotos simples de produtos em artes prontas para vender no Instagram e no
          WhatsApp. Sem Photoshop, sem Canva, sem prompt.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link href="/login" className="btn btn-primary btn-block">
            Começar grátis
          </Link>
          <p className="text-xs text-[var(--muted)]">3 créditos grátis para testar</p>
        </div>
      </div>

      <ol className="mt-12 space-y-4">
        {[
          "Envie a foto do seu produto",
          "Responda perguntas rápidas (formato, estilo, preço)",
          "Receba artes prontas e baixe para postar",
        ].map((passo, i) => (
          <li key={i} className="card p-4 flex items-center gap-4">
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center font-bold text-sm">
              {i + 1}
            </span>
            <span className="text-sm">{passo}</span>
          </li>
        ))}
      </ol>
    </main>
  );
}
