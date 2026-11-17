"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { criarCliente } from "@/app/(app)/clientes/actions";
import { erroDoPlano } from "@/components/CamposPlano";
import ComoEntra, { type ModoCadastro } from "@/components/ComoEntra";

// Cadastro de cliente novo, só do sócio. Todo cliente entra com o primeiro plano,
// de 1 mês no mínimo, ou em teste: sem plano e sem pagamento.
//
// Duas colunas no PC, para o botão aparecer sem rolar no notebook do dono
// (1536×695). No celular uma embaixo da outra.
export default function FormNovoCliente({ hoje, precos }: { hoje: string; precos: Record<string, number> }) {
  const router = useRouter();
  const [modo, setModo] = useState<ModoCadastro>("plano");
  const [enviando, iniciarEnvio] = useTransition();
  const [erro, setErro] = useState<{ texto: string; clienteId?: string } | null>(null);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const dados = new FormData(evento.currentTarget);
    if (!String(dados.get("nome") ?? "").trim()) {
      setErro({ texto: "Informe o nome da empresa." });
      return;
    }
    const problema = modo === "plano" ? erroDoPlano(dados, hoje) : null;
    if (problema) {
      setErro({ texto: problema });
      return;
    }
    iniciarEnvio(async () => {
      const resultado = await criarCliente(dados);
      if (resultado.erro) {
        setErro({ texto: resultado.erro, clienteId: resultado.id });
        return;
      }
      if (resultado.id) router.push(`/clientes/${resultado.id}`);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        <fieldset className="flex flex-col gap-3 min-w-0">
          <legend className="text-[13px] font-semibold mb-3">Empresa</legend>
          <label className="flex flex-col">
            <span className="label">Nome da empresa *</span>
            <input name="nome" required className="input" placeholder="Ex: Burger do Zé" />
          </label>
          <label className="flex flex-col">
            <span className="label">Nicho</span>
            <input name="nicho" className="input" placeholder="Ex: fast-food, gastrobar" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col">
              <span className="label">Contato</span>
              <input name="contato_nome" className="input" />
            </label>
            <label className="flex flex-col">
              <span className="label">Telefone</span>
              <input name="contato_telefone" className="input" />
            </label>
          </div>
          <label className="flex flex-col">
            <span className="label">Sobre a empresa</span>
            <textarea
              name="observacoes"
              className="input min-h-[76px] resize-y"
              placeholder="O que ela faz, para quem e como a pessoa compra. A IA lê isto antes de criar qualquer arte."
            />
          </label>
        </fieldset>

        <ComoEntra modo={modo} aoMudar={setModo} hoje={hoje} precos={precos} />
      </div>

      {erro && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {erro.texto}
          {erro.clienteId && (
            <>
              {" "}
              <Link href={`/clientes/${erro.clienteId}#plano`} className="font-medium underline">
                Abrir o cliente
              </Link>
            </>
          )}
        </p>
      )}

      <button type="submit" disabled={enviando} className="btn btn-primary self-end">
        {enviando && <span className="spinner" aria-hidden="true" />}
        {modo === "plano" ? "Cadastrar com plano" : "Cadastrar em teste"}
      </button>
    </form>
  );
}
