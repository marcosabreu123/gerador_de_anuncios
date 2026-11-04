import { requireSocio } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import BotaoEnviar from "@/components/BotaoEnviar";
import NovoUsuarioForm from "@/components/NovoUsuarioForm";
import { Avatar, CabecalhoPagina, TituloCard } from "@/components/ui";
import { alterarAtivo, alterarPapel, enviarRedefinicaoSenha } from "./actions";
import { PAPEIS, type PapelUsuario, type UserRow } from "@/lib/types";

export default async function ConfiguracoesPage() {
  const { authId } = await requireSocio();
  // RLS de public.users é "auth.uid() = id": com o client de sessão o sócio
  // enxergaria só a própria linha e a tela de equipe viria vazia. O acesso
  // já foi validado por requireSocio acima, então aqui vai o client admin.
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("users")
    .select("*")
    .order("papel")
    .order("email");

  const usuarios = (data ?? []) as UserRow[];
  const equipe = usuarios.filter((u) => u.papel === "socio" || u.papel === "colaborador");
  const semAcesso = usuarios.filter((u) => u.papel === "sem_acesso");

  return (
    <main className="pagina flex flex-col gap-6">
      <CabecalhoPagina titulo="Configurações" descricao="Quem tem acesso à ferramenta e com qual papel." />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          <section className="card p-5 flex flex-col gap-2">
            <TituloCard titulo={`Equipe (${equipe.length})`} />
            <div className="flex flex-col">
              {equipe.map((u) => (
                <LinhaUsuario key={u.id} usuario={u} ehVoce={u.id === authId} />
              ))}
            </div>
          </section>

          {semAcesso.length > 0 && (
            <section className="card p-5 flex flex-col gap-3">
              <TituloCard
                titulo={`Contas sem acesso (${semAcesso.length})`}
                descricao="Contas que autenticam mas não entram. São os cadastros do tempo em que o app era vendido por assinatura, e ficam aqui só por registro. Dê acesso apenas a quem é da equipe."
              />
              <details>
                <summary className="text-sm cursor-pointer text-[var(--muted)] hover:text-[var(--foreground)] w-fit">
                  Ver contas
                </summary>
                <div className="flex flex-col mt-2">
                  {semAcesso.map((u) => (
                    <LinhaUsuario key={u.id} usuario={u} ehVoce={u.id === authId} />
                  ))}
                </div>
              </details>
            </section>
          )}
        </div>

        <NovoUsuarioForm />
      </div>
    </main>
  );
}

function LinhaUsuario({ usuario, ehVoce }: { usuario: UserRow; ehVoce: boolean }) {
  const papeis: PapelUsuario[] = ["socio", "colaborador", "sem_acesso"];
  const nome = usuario.nome ?? usuario.email;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 justify-between py-3 border-t first:border-t-0 border-[var(--border)]">
      <div className="flex items-center gap-3 min-w-0 flex-1 basis-56">
        <Avatar nome={nome} tamanho={36} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {nome}
            {ehVoce && <span className="text-xs text-[var(--muted)] font-normal"> · você</span>}
            {!usuario.ativo && <span className="text-xs text-[var(--danger)] font-normal"> · desativado</span>}
          </p>
          {usuario.nome && <p className="text-xs text-[var(--muted)] truncate">{usuario.email}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Um sócio não consegue rebaixar nem desativar a própria conta — a
            ação no servidor também recusa, isto aqui só evita o clique. */}
        <form action={alterarPapel} className="flex items-center gap-1.5">
          <input type="hidden" name="id" value={usuario.id} />
          <select
            name="papel"
            defaultValue={usuario.papel}
            disabled={ehVoce}
            className="input w-auto min-h-8 py-1 text-[13px]"
          >
            {papeis.map((p) => (
              <option key={p} value={p}>
                {PAPEIS[p].label}
              </option>
            ))}
          </select>
          {!ehVoce && <BotaoEnviar className="btn btn-outline btn-sm">Salvar</BotaoEnviar>}
        </form>

        {usuario.papel !== "sem_acesso" && (
          <form action={enviarRedefinicaoSenha}>
            <input type="hidden" name="email" value={usuario.email} />
            <BotaoEnviar className="btn btn-ghost btn-sm">Redefinir senha</BotaoEnviar>
          </form>
        )}

        {!ehVoce && (
          <form action={alterarAtivo}>
            <input type="hidden" name="id" value={usuario.id} />
            <input type="hidden" name="ativo" value={usuario.ativo ? "false" : "true"} />
            <BotaoEnviar className="btn btn-ghost btn-sm">{usuario.ativo ? "Desativar" : "Reativar"}</BotaoEnviar>
          </form>
        )}
      </div>
    </div>
  );
}
