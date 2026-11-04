"use client";

import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Marca } from "@/components/ui";
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
    <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] min-h-dvh">
      <div className="flex flex-col px-6 py-6 lg:px-10">
        <Marca />

        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-[360px]">
            <h1 className="text-[28px] font-semibold tracking-[-0.025em]">Entrar</h1>
            <p className="text-[var(--muted)] mt-1.5 text-sm">Ferramenta interna da agência.</p>

            <form action={formAction} className="flex flex-col gap-4 mt-7">
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
                {pending && <span className="spinner" aria-hidden="true" />}
                {pending ? "Aguarde…" : "Entrar"}
              </button>
            </form>
          </div>
        </div>
      </div>

      <Vitrine />
    </div>
  );
}

// Peças feitas pela própria ferramenta, para marcas fictícias. Fundo escuro nos
// dois temas: arte publicitária aparece melhor sobre ele.
function Vitrine() {
  return (
    <div
      aria-hidden="true"
      className="hidden lg:flex relative overflow-hidden items-center justify-center bg-[#0b0b0e]"
      style={{
        background:
          "radial-gradient(520px 420px at 22% 18%, rgba(125,184,255,.16), transparent 70%), radial-gradient(560px 460px at 82% 82%, rgba(255,143,180,.13), transparent 70%), #0b0b0e",
      }}
    >
      <div className="relative w-[min(30vw,400px)] aspect-[4/5]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vitrine/perfume.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover rounded-2xl shadow-2xl -translate-x-[56%] translate-y-[5%] -rotate-[9deg] scale-[0.88]"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vitrine/sobrancelhas.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover rounded-2xl shadow-2xl translate-x-[56%] translate-y-[5%] rotate-[9deg] scale-[0.88]"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vitrine/burger.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover rounded-2xl shadow-2xl"
        />
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
