import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Entrada da ferramenta interna. Era uma landing de venda self-service
// ("crie anúncios profissionais", "10 créditos grátis para testar") — não faz
// mais sentido: o app deixou de ser vendido para o lojista e passou a ser a
// ferramenta de produção da agência. Quem entra aqui é operador.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return (
    <main className="app-shell min-h-dvh flex flex-col items-center justify-center text-center gap-6 py-12">
      <div>
        <p className="text-xs tracking-widest text-[var(--muted)] uppercase">Ferramenta interna</p>
        <h1 className="text-3xl font-bold tracking-tight mt-2">
          Artes<span className="text-[var(--accent)]"> IA</span>
        </h1>
        <p className="text-sm text-[var(--muted)] mt-3 max-w-sm">
          Produção de artes publicitárias para os clientes da agência, com controle de plano e custo por
          cliente.
        </p>
      </div>

      <Link href="/login" className="btn btn-primary">
        Entrar
      </Link>
    </main>
  );
}
