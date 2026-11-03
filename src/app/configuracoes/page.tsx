import { requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AgenciaHeader from "@/components/AgenciaHeader";
import NovoUsuarioForm from "@/components/NovoUsuarioForm";
import { alterarAtivo, alterarPapel, enviarRedefinicaoSenha } from "./actions";
import { PAPEIS, type PapelUsuario, type UserRow } from "@/lib/types";

export default async function ConfiguracoesPage() {
  const { perfil, authId } = await requireSocio();
  const supabase = await createClient();

  const { data } = await supabase
    .from("users")
    .select("*")
    .order("papel")
    .order("email");

  const usuarios = (data ?? []) as UserRow[];
  const equipe = usuarios.filter((u) => u.papel === "socio" || u.papel === "colaborador");
  const semAcesso = usuarios.filter((u) => u.papel === "sem_acesso");

  return (
    <>
      <AgenciaHeader nome={perfil.nome ?? perfil.email} papel={perfil.papel} />
      <main className="app-shell py-6 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
          <p className="text-sm text-[var(--muted)] mt-1">Quem tem acesso à ferramenta e com qual papel.</p>
        </div>

        <NovoUsuarioForm />

        <section className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold">Equipe ({equipe.length})</h2>
          <div className="flex flex-col gap-2">
            {equipe.map((u) => (
              <LinhaUsuario key={u.id} usuario={u} ehVoce={u.id === authId} />
            ))}
          </div>
        </section>

        {semAcesso.length > 0 && (
          <section className="card p-4 flex flex-col gap-3">
            <div>
              <h2 className="font-semibold">Contas sem acesso ({semAcesso.length})</h2>
              <p className="text-xs text-[var(--muted)] mt-0.5">
                Contas que autenticam mas não entram. São os cadastros do tempo em que o app era vendido
                por assinatura — ficam aqui só por registro. Dê acesso apenas a quem é da equipe.
              </p>
            </div>
            <details>
              <summary className="text-sm cursor-pointer text-[var(--muted)]">Ver contas</summary>
              <div className="flex flex-col gap-2 mt-3">
                {semAcesso.map((u) => (
                  <LinhaUsuario key={u.id} usuario={u} ehVoce={u.id === authId} />
                ))}
              </div>
            </details>
          </section>
        )}
      </main>
    </>
  );
}

function LinhaUsuario({ usuario, ehVoce }: { usuario: UserRow; ehVoce: boolean }) {
  const papeis: PapelUsuario[] = ["socio", "colaborador", "sem_acesso"];

  return (
    <div className="bg-[var(--surface-muted)] rounded-xl px-3 py-2 flex flex-wrap items-center gap-2 justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {usuario.nome ?? usuario.email}
          {ehVoce && <span className="text-xs text-[var(--muted)] font-normal"> · você</span>}
          {!usuario.ativo && <span className="text-xs text-[var(--danger)] font-normal"> · desativado</span>}
        </p>
        {usuario.nome && <p className="text-xs text-[var(--muted)] truncate">{usuario.email}</p>}
      </div>

      <div className="flex items-center gap-2">
        {/* Um sócio não consegue rebaixar nem desativar a própria conta — a
            ação no servidor também recusa, isto aqui só evita o clique. */}
        <form action={alterarPapel} className="flex items-center gap-1">
          <input type="hidden" name="id" value={usuario.id} />
          <select
            name="papel"
            defaultValue={usuario.papel}
            disabled={ehVoce}
            className="input text-xs py-1 w-auto"
          >
            {papeis.map((p) => (
              <option key={p} value={p}>
                {PAPEIS[p].label}
              </option>
            ))}
          </select>
          <button type="submit" disabled={ehVoce} className="btn btn-outline text-xs py-1">
            Salvar
          </button>
        </form>

        {usuario.papel !== "sem_acesso" && (
          <form action={enviarRedefinicaoSenha}>
            <input type="hidden" name="email" value={usuario.email} />
            <button type="submit" className="text-xs text-[var(--muted)] underline">
              Redefinir senha
            </button>
          </form>
        )}

        {!ehVoce && (
          <form action={alterarAtivo}>
            <input type="hidden" name="id" value={usuario.id} />
            <input type="hidden" name="ativo" value={usuario.ativo ? "false" : "true"} />
            <button type="submit" className="text-xs text-[var(--muted)] underline">
              {usuario.ativo ? "Desativar" : "Reativar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
