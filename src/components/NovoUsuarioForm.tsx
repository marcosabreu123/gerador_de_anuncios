"use client";

import { useActionState, useState } from "react";
import { Plus, X } from "lucide-react";
import { criarUsuario, type EstadoNovoUsuario } from "@/app/(app)/configuracoes/actions";
import { TituloCard } from "@/components/ui";
import { PAPEIS } from "@/lib/types";

const INICIAL: EstadoNovoUsuario = {};

// Criação de acesso para a equipe. O formulário fica atrás de um botão porque é
// ação ocasional — não deve ocupar a tela de quem só veio conferir a equipe.
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

  return (
    <section className="card p-5 flex flex-col gap-4 xl:sticky xl:top-6">
      <TituloCard
        titulo="Novo acesso"
        descricao="O sistema gera uma senha temporária. Você entrega essa senha e a pessoa troca depois."
        acoes={
          aberto && (
            <button
              type="button"
              onClick={() => setAberto(false)}
              className="btn btn-ghost btn-icone -mt-1 -mr-1"
              aria-label="Fechar"
            >
              <X size={16} aria-hidden="true" />
            </button>
          )
        }
      />

      {!aberto && (
        <button type="button" onClick={() => setAberto(true)} className="btn btn-primary self-start">
          <Plus size={16} aria-hidden="true" />
          Novo acesso
        </button>
      )}

      {/* Senha aparece UMA vez: o Supabase guarda só o hash, não dá para
          recuperá-la depois. Se perder, use "Redefinir senha" na lista. */}
      {aberto &&
        (estado.senhaTemporaria ? (
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
                className="btn btn-outline btn-sm shrink-0"
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
              className="btn btn-primary mt-1"
            >
              Concluir
            </button>
          </div>
        ) : (
          <form action={acao} className="flex flex-col gap-3">
            <label className="flex flex-col">
              <span className="label">E-mail *</span>
              <input name="email" type="email" required className="input" placeholder="pessoa@email.com" />
            </label>
            <label className="flex flex-col">
              <span className="label">Nome</span>
              <input name="nome" className="input" placeholder="Como chamar a pessoa" />
            </label>

            <fieldset className="flex flex-col gap-2">
              <legend className="label">Papel</legend>
              {(["colaborador", "socio"] as const).map((papel, i) => (
                <label key={papel} className="quadro flex items-start gap-2.5 px-3 py-2.5 cursor-pointer">
                  <input type="radio" name="papel" value={papel} defaultChecked={i === 0} className="mt-1" />
                  <span>
                    <span className="font-medium text-sm">{PAPEIS[papel].label}</span>
                    <span className="block text-xs text-[var(--muted)]">{PAPEIS[papel].descricao}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {estado.erro && <p className="text-sm text-[var(--danger)]">{estado.erro}</p>}

            <button type="submit" disabled={pendente} className="btn btn-primary self-start">
              {pendente && <span className="spinner" aria-hidden="true" />}
              {pendente ? "Criando…" : "Criar acesso"}
            </button>
          </form>
        ))}
    </section>
  );
}
