"use client";

import { useActionState, useState } from "react";
import { criarUsuario, type EstadoNovoUsuario } from "@/app/configuracoes/actions";
import { PAPEIS } from "@/lib/types";

const INICIAL: EstadoNovoUsuario = {};

// Criação de acesso para a equipe. Fica atrás de um botão porque é ação
// ocasional — não deve ocupar a tela de quem só veio conferir a equipe.
export default function NovoUsuarioForm() {
  const [estado, acao, pendente] = useActionState(criarUsuario, INICIAL);
  const [aberto, setAberto] = useState(false);
  const [copiada, setCopiada] = useState(false);

  async function copiarSenha(senha: string) {
    try {
      await navigator.clipboard.writeText(senha);
      setCopiada(true);
      setTimeout(() => setCopiada(false), 2500);
    } catch {
      // Sem permissão de clipboard: a senha segue visível para copiar à mão.
    }
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="btn btn-primary self-start">
        + Novo acesso
      </button>
    );
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Novo acesso</h3>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            O sistema gera uma senha temporária. Você entrega essa senha e a pessoa troca depois.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="Fechar"
        >
          ✕
        </button>
      </div>

      {/* Senha aparece UMA vez: o Supabase guarda só o hash, não dá para
          recuperá-la depois. Se perder, use "Redefinir senha" na lista. */}
      {estado.senhaTemporaria ? (
        <div className="bg-[var(--accent-soft)] rounded-xl p-3 flex flex-col gap-2">
          <p className="text-sm font-semibold">Acesso criado para {estado.emailCriado}</p>
          <p className="text-xs text-[var(--muted)]">
            Copie a senha temporária agora — ela não vai aparecer de novo.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-[var(--surface-muted)] rounded-lg px-3 py-2 text-sm break-all">
              {estado.senhaTemporaria}
            </code>
            <button
              type="button"
              onClick={() => copiarSenha(estado.senhaTemporaria!)}
              className="btn btn-outline text-xs py-1 shrink-0"
            >
              {copiada ? "Copiado" : "Copiar"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              setAberto(false);
              window.location.reload();
            }}
            className="btn btn-primary text-sm mt-1"
          >
            Concluir
          </button>
        </div>
      ) : (
        <form action={acao} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="label">E-mail *</span>
              <input name="email" type="email" required className="input" placeholder="pessoa@email.com" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Nome</span>
              <input name="nome" className="input" placeholder="Como chamar a pessoa" />
            </label>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="label mb-1">Papel</legend>
            {(["colaborador", "socio"] as const).map((papel, i) => (
              <label
                key={papel}
                className="flex items-start gap-2 bg-[var(--surface-muted)] rounded-xl px-3 py-2 cursor-pointer"
              >
                <input type="radio" name="papel" value={papel} defaultChecked={i === 0} className="mt-1" />
                <span>
                  <span className="font-semibold text-sm">{PAPEIS[papel].label}</span>
                  <span className="block text-xs text-[var(--muted)]">{PAPEIS[papel].descricao}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {estado.erro && <p className="text-sm text-[var(--danger)]">{estado.erro}</p>}

          <button type="submit" disabled={pendente} className="btn btn-primary self-start">
            {pendente ? "Criando…" : "Criar acesso"}
          </button>
        </form>
      )}
    </div>
  );
}
