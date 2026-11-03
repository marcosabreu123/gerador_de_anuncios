import { signout } from "@/app/login/actions";
import { requireUser } from "@/lib/auth";

// Destino de quem autentica mas não tem papel na operação.
//
// Existe porque as contas do modelo antigo (lojistas do tempo em que o app
// era vendido por assinatura) continuam válidas no Supabase. Elas precisam
// de uma saída honesta — não de um erro seco nem de um redirect em loop.
export default async function SemAcessoPage() {
  const { perfil } = await requireUser();

  return (
    <main className="app-shell min-h-dvh flex flex-col items-center justify-center text-center gap-5 py-12">
      <div className="card p-6 max-w-md">
        <h1 className="text-xl font-bold tracking-tight">Esta conta não tem acesso</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          A conta <span className="font-medium text-[var(--foreground)]">{perfil.email}</span> está
          autenticada, mas não faz parte da equipe da agência.
        </p>
        <p className="text-sm text-[var(--muted)] mt-3">
          Se você deveria ter acesso, peça a um sócio para liberar seu login nas configurações.
        </p>
        <form action={signout} className="mt-5">
          <button type="submit" className="btn btn-outline btn-block">
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
