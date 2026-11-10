"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import Modal from "@/components/Modal";
import { lancarGasto } from "@/app/(app)/financeiro/actions";
import { CATEGORIAS_GASTO, MAX_DESCRICAO_GASTO, type CategoriaGasto } from "@/lib/agencia/financeiro";
import { centavosParaBRL, reaisParaCentavos } from "@/lib/agencia/types";
import { formatarDia } from "@/lib/datas";

// O botão "Lançar gasto" do Financeiro e o formulário dele, numa janela: no
// notebook do dono (1536×695) o botão fica no topo, sem rolar.

const CATEGORIAS = Object.keys(CATEGORIAS_GASTO) as CategoriaGasto[];

const EXEMPLOS: Record<CategoriaGasto, string> = {
  openai: "Recarga de créditos",
  funcionario: "Salário do mês",
  ferramentas: "Canva, domínio, hospedagem",
  impostos: "DAS, tarifa do banco",
  outros: "O que foi",
};

export default function LancarGasto({ hoje, mesAberto }: { hoje: string; mesAberto: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [feito, setFeito] = useState<string | null>(null);

  function aoLancar(resumo: string, dia: string) {
    setAberto(false);
    setFeito(resumo);
    // Lançado em outro mês, a página vai para ele: senão o gasto não aparece no extrato aberto.
    const mes = dia.slice(0, 7);
    if (mes !== mesAberto) router.push(`/financeiro?mes=${mes}`);
  }

  return (
    <>
      <p role="status" className="flex items-center gap-1.5 text-[13px] text-[var(--success)] empty:hidden">
        {feito && (
          <>
            <Check size={14} aria-hidden="true" />
            {feito}
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => {
          setFeito(null);
          setAberto(true);
        }}
        className="btn btn-primary"
      >
        <Plus size={16} aria-hidden="true" />
        Lançar gasto
      </button>
      {aberto && (
        <Modal titulo="Lançar gasto" aoFechar={() => setAberto(false)}>
          <FormGasto hoje={hoje} aoLancar={aoLancar} aoCancelar={() => setAberto(false)} />
        </Modal>
      )}
    </>
  );
}

// Envio por onSubmit, não pela prop action: depois de uma action o React limpa o
// formulário, e a categoria escolhida voltaria para a primeira.
function FormGasto({
  hoje,
  aoLancar,
  aoCancelar,
}: {
  hoje: string;
  aoLancar: (resumo: string, dia: string) => void;
  aoCancelar: () => void;
}) {
  const [enviando, iniciarEnvio] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<CategoriaGasto>("openai");

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const dados = new FormData(evento.currentTarget);
    const centavos = reaisParaCentavos(String(dados.get("valor_reais") ?? ""));
    if (centavos === null) {
      setErro("Informe quanto saiu, em reais.");
      return;
    }
    const dia = String(dados.get("dia") ?? "") || hoje;
    if (dia > hoje) {
      setErro("A data não pode ser depois de hoje.");
      return;
    }
    iniciarEnvio(async () => {
      const resultado = await lancarGasto(dados);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      aoLancar(`${CATEGORIAS_GASTO[categoria]}: ${centavosParaBRL(centavos)} em ${formatarDia(dia)}.`, dia);
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-3.5">
      <input type="hidden" name="categoria" value={categoria} />

      <div role="group" aria-label="Categoria" className="flex flex-wrap gap-2">
        {CATEGORIAS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategoria(c)}
            aria-pressed={categoria === c}
            className={categoria === c ? "chip chip-selected" : "chip"}
          >
            {CATEGORIAS_GASTO[c]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span className="label">Valor (R$)</span>
          <input name="valor_reais" inputMode="decimal" required placeholder="0,00" className="input" />
        </label>
        <label className="flex flex-col">
          <span className="label">Data</span>
          <input name="dia" type="date" required max={hoje} defaultValue={hoje} className="input" />
        </label>
      </div>

      {categoria === "openai" && (
        <label className="flex flex-col">
          <span className="label">Crédito que entrou lá (US$)</span>
          <input name="credito_usd" inputMode="decimal" placeholder="0,00" className="input" />
          <span className="text-xs text-[var(--muted)] mt-1.5">
            Com o crédito em dólar, o app estima quanto ainda sobra na OpenAI.
          </span>
        </label>
      )}

      <label className="flex flex-col">
        <span className="label">
          Descrição <span className="font-normal text-[var(--muted)]">(opcional)</span>
        </span>
        <input name="descricao" maxLength={MAX_DESCRICAO_GASTO} placeholder={EXEMPLOS[categoria]} className="input" />
      </label>

      {erro && (
        <p role="alert" className="text-[13px] text-[var(--danger)]">
          {erro}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={aoCancelar} className="btn btn-ghost">
          Cancelar
        </button>
        <button type="submit" disabled={enviando} className="btn btn-primary">
          {enviando && <span className="spinner" aria-hidden="true" />}
          Lançar gasto
        </button>
      </div>
    </form>
  );
}
