import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AgenciaHeader from "@/components/AgenciaHeader";
import { criarCliente } from "./actions";
import { centavosParaBRL, type Cliente, type Pacote } from "@/lib/agencia/types";

export default async function ClientesPage() {
  const { perfil } = await requireUser();
  const supabase = await createClient();

  const { data: clientesRaw } = await supabase
    .from("clientes")
    .select("*")
    .order("ativo", { ascending: false })
    .order("nome");

  const clientes = (clientesRaw ?? []) as Cliente[];

  // Saldo de todos os clientes numa consulta só, em vez de uma por card.
  const { data: pacotesRaw } = await supabase
    .from("pacotes")
    .select("cliente_id, qtd_imagens, qtd_usadas, status, valor_centavos, validade");
  const pacotes = (pacotesRaw ?? []) as Pick<
    Pacote,
    "cliente_id" | "qtd_imagens" | "qtd_usadas" | "status" | "valor_centavos" | "validade"
  >[];

  const hoje = new Date().toISOString().slice(0, 10);
  const saldoPorCliente = new Map<string, number>();
  for (const p of pacotes) {
    if (p.status !== "ativo") continue;
    if (p.validade && p.validade < hoje) continue;
    saldoPorCliente.set(
      p.cliente_id,
      (saldoPorCliente.get(p.cliente_id) ?? 0) + (p.qtd_imagens - p.qtd_usadas),
    );
  }

  return (
    <>
      <AgenciaHeader nome={perfil.nome ?? perfil.email} />
      <main className="app-shell py-6 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Cada cliente guarda a própria identidade visual, as referências e o saldo do pacote.
          </p>
        </div>

        {clientes.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="font-semibold">Nenhum cliente cadastrado ainda</p>
            <p className="text-sm text-[var(--muted)] mt-1">
              Cadastre o primeiro no formulário abaixo para começar a produzir.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {clientes.map((cliente) => {
              const saldo = saldoPorCliente.get(cliente.id) ?? 0;
              return (
                <Link key={cliente.id} href={`/clientes/${cliente.id}`} className="card card-interactive p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{cliente.nome}</p>
                      <p className="text-xs text-[var(--muted)] mt-0.5">
                        {cliente.nicho ?? "Nicho não informado"}
                      </p>
                    </div>
                    <span
                      className="badge shrink-0"
                      title={saldo > 0 ? "Imagens disponíveis no pacote" : "Sem saldo — venda um pacote"}
                    >
                      {saldo > 0 ? `${saldo} img` : "sem saldo"}
                    </span>
                  </div>
                  {!cliente.ativo && (
                    <p className="text-xs text-[var(--muted)] mt-2">Inativo</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        <form action={criarCliente} className="card p-4 flex flex-col gap-3">
          <h2 className="font-semibold">Novo cliente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="label">Nome da empresa *</span>
              <input name="nome" required className="input" placeholder="Ex: Burger do Zé" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Nicho</span>
              <input name="nicho" className="input" placeholder="Ex: fast-food, gastrobar, açougue" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Contato</span>
              <input name="contato_nome" className="input" placeholder="Nome de quem fala com a gente" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label">Telefone</span>
              <input name="contato_telefone" className="input" placeholder="(00) 00000-0000" />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="label">Observações</span>
            <textarea
              name="observacoes"
              className="input min-h-[70px] resize-none"
              placeholder="Qualquer coisa que o agente precise saber sobre esse cliente."
            />
          </label>
          <button type="submit" className="btn btn-primary self-start">
            Cadastrar cliente
          </button>
        </form>

        <p className="text-xs text-[var(--muted)]">
          Pacote de entrada: 10 imagens por {centavosParaBRL(3490)}.
        </p>
      </main>
    </>
  );
}
