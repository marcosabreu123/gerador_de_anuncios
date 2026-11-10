"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { registrarPlano } from "@/app/(app)/clientes/actions";
import CamposPlano, { erroDoPlano, type RenovacaoPlano } from "@/components/CamposPlano";

// Registro de plano na página do cliente: o primeiro, a renovação ou um novo. A
// agência não vende mais pacote avulso de créditos.
//
// Envio por onSubmit, não pela prop action: depois de uma action o React limpa o
// formulário, e o select controlado voltava para Pix na tela com Cartão no estado.
export default function FormPlano({
  clienteId,
  hoje,
  coberturaAtual,
  precos,
  renovacao,
  mesesSugeridos,
  emTeste = false,
}: {
  clienteId: string;
  hoje: string;
  coberturaAtual: string | null;
  precos: Record<string, number>;
  renovacao?: RenovacaoPlano | null;
  mesesSugeridos?: number | null;
  // Registrar o primeiro plano tira o cliente do teste: o botão avisa.
  emTeste?: boolean;
}) {
  const router = useRouter();
  const formulario = useRef<HTMLFormElement>(null);
  const [enviando, iniciarEnvio] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  // "Renovar" fica no histórico (abaixo do formulário no celular) e no aviso do
  // topo (acima dele): sem rolar até aqui, o clique parecia não fazer nada. A aba
  // pode ainda estar escondida quando o formulário monta, porque Abas lê o
  // #plano depois; o observador espera o formulário ganhar tamanho. "nearest"
  // só rola o que falta para o botão aparecer.
  const renovandoId = renovacao?.id;
  useEffect(() => {
    const el = formulario.current;
    if (!renovandoId || !el) return;
    const observador = new ResizeObserver(([entrada]) => {
      if (!entrada || entrada.contentRect.height === 0) return;
      observador.disconnect();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, [renovandoId]);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setFeito(null);
    const dados = new FormData(evento.currentTarget);
    const problema = erroDoPlano(dados, hoje);
    if (problema) {
      setErro(problema);
      return;
    }
    iniciarEnvio(async () => {
      const resultado = await registrarPlano(dados);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setFeito(emTeste ? "Plano registrado. O cliente saiu do teste." : "Plano registrado.");
      // Sem o ?renovar no endereço, um segundo clique não renova de novo o mesmo plano.
      if (renovacao) router.replace(`/clientes/${clienteId}#plano`, { scroll: false });
    });
  }

  // Compacto de propósito: no notebook do dono (1536×695) o botão de registrar
  // precisa aparecer sem rolar.
  return (
    <form
      ref={formulario}
      onSubmit={enviar}
      className="flex flex-col gap-3.5 scroll-mt-20 scroll-mb-24 lg:scroll-mb-6"
    >
      <input type="hidden" name="cliente_id" value={clienteId} />
      <CamposPlano
        hoje={hoje}
        coberturaAtual={coberturaAtual}
        precos={precos}
        renovacao={renovacao}
        mesesSugeridos={mesesSugeridos}
        aoMudar={() => setFeito(null)}
      />

      {erro && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {erro}
        </p>
      )}
      {feito && (
        <p role="status" className="flex items-center gap-1.5 text-[13px] text-[var(--success)]">
          <Check size={14} aria-hidden="true" />
          {feito}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {emTeste && <p className="text-[13px] text-[var(--muted)]">Ao registrar, o cliente sai do teste.</p>}
        <button type="submit" disabled={enviando} className="btn btn-primary ml-auto">
          {enviando && <span className="spinner" aria-hidden="true" />}
          Registrar plano
        </button>
      </div>
    </form>
  );
}
