"use client";

import { useActionState, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { login, signup, type AuthState } from "./actions";

const inicial: AuthState = {};

function LoginForm() {
  const [modo, setModo] = useState<"login" | "signup">("login");
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";

  const action = modo === "login" ? login : signup;
  const [state, formAction, pending] = useActionState(action, inicial);

  return (
    <div className="app-shell flex-1 flex flex-col justify-center py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Artes com IA</h1>
        <p className="text-[var(--muted)] mt-2 text-sm">
          Transforme fotos de produtos em anúncios prontos para vender.
        </p>
      </div>

      <div className="card p-6">
        <div className="flex gap-2 mb-6 p-1 bg-[var(--accent-soft)] rounded-xl">
          <button
            type="button"
            onClick={() => setModo("login")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
              modo === "login" ? "bg-[var(--surface)] shadow-sm" : "text-[var(--muted)]"
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setModo("signup")}
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
              modo === "signup" ? "bg-[var(--surface)] shadow-sm" : "text-[var(--muted)]"
            }`}
          >
            Criar conta
          </button>
        </div>

        <form action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />

          {modo === "signup" && (
            <div>
              <label className="label" htmlFor="nome">
                Nome
              </label>
              <input id="nome" name="nome" className="input" placeholder="Como te chamam?" />
            </div>
          )}

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
              autoComplete={modo === "login" ? "current-password" : "new-password"}
              required
              className="input"
              placeholder="••••••••"
            />
          </div>

          {state.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
          {state.message && <p className="text-sm text-[var(--success)]">{state.message}</p>}

          <button type="submit" disabled={pending} className="btn btn-primary btn-block mt-2">
            {pending ? "Aguarde…" : modo === "login" ? "Entrar" : "Criar conta"}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-[var(--muted)] mt-6">
        Ao continuar, você ganha 10 créditos grátis para testar.
      </p>
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
