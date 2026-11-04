"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { login, type AuthState } from "./actions";

const inicial: AuthState = {};

// Só entrada. Login novo é criado pelo sócio em /configuracoes: a ferramenta é
// interna, e a aba "Criar conta" do tempo do self-service abria a porta para
// qualquer pessoa.
function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const [state, formAction, pending] = useActionState(login, inicial);

  return (
    <div className="app-shell flex-1 flex flex-col justify-center py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Artes com IA</h1>
        <p className="text-[var(--muted)] mt-2 text-sm">Ferramenta interna da agência.</p>
      </div>

      <div className="card p-6">
        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />

          <div>
            <label className="label" htmlFor="email">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input"
              placeholder="voce@email.com"
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              placeholder="••••••••"
            />
          </div>

          {state.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}

          <button type="submit" disabled={pending} className="btn btn-primary btn-block mt-2">
            {pending ? "Aguarde…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
