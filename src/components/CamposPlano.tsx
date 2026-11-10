"use client";

import { useState } from "react";
import { formatarDia } from "@/lib/datas";
import { DURACOES_PLANO, IMAGENS_POR_PLANO, chaveDoPreco, duracaoValida, vencimentoDoPlano } from "@/lib/agencia/cobrancas";
import { METODOS_PAGAMENTO, centavosParaCampo, reaisParaCentavos } from "@/lib/agencia/types";

// Plano que o botão "Renovar" manda repetir: duração, créditos e valor vêm dele.
export interface RenovacaoPlano {
  id: string;
  nome: string;
  meses: number;
  qtdImagens: number;
  valorCentavos: number;
}

// Confere no navegador o que o servidor também confere, para o erro aparecer sem
// ida e volta. Nulo quando está tudo certo.
export function erroDoPlano(dados: FormData, hoje: string): string | null {
  if (reaisParaCentavos(String(dados.get("valor_reais") ?? "")) === null) return "Informe o valor do plano.";
  const dia = String(dados.get("assinado_em") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia > hoje) return "A data de contratação não pode ser depois de hoje.";
  return null;
}

// Os campos do plano, iguais no cadastro do cliente e na página dele: duração,
// créditos, valor, contratação e pagamento. O menor plano é de 1 mês. O
// vencimento aparece antes de salvar, calculado com a mesma regra do servidor,
// para o sócio conferir com o que combinou com o cliente.
//
// Os campos levam nome: quem envia é o formulário em volta, pelo FormData.
export default function CamposPlano({
  hoje,
  coberturaAtual = null,
  precos,
  renovacao,
  mesesSugeridos,
  aoMudar,
}: {
  hoje: string;
  // Vencimento do plano em vigor: o plano novo começa quando ele acaba.
  coberturaAtual?: string | null;
  // Último valor cobrado em cada duração (ver precosSugeridos).
  precos: Record<string, number>;
  renovacao?: RenovacaoPlano | null;
  // Duração do plano atual do cliente: quem paga por trimestre costuma renovar por trimestre.
  mesesSugeridos?: number | null;
  aoMudar?: () => void;
}) {
  const [meses, setMeses] = useState<number>(
    renovacao?.meses ??
      (mesesSugeridos && duracaoValida(mesesSugeridos) ? mesesSugeridos : DURACOES_PLANO[0].meses),
  );
  const [imagens, setImagens] = useState(String(renovacao?.qtdImagens ?? IMAGENS_POR_PLANO));
  const [valor, setValor] = useState(() => {
    const centavos = renovacao?.valorCentavos ?? precos[chaveDoPreco("tempo", meses)];
    return centavos ? centavosParaCampo(centavos) : "";
  });
  const [assinadoEm, setAssinadoEm] = useState(hoje);
  const [metodo, setMetodo] = useState("pix");
  const [jaPago, setJaPago] = useState(true);

  // Cada duração lembra o próprio preço: trocar de 1 mês para Anual troca o valor.
  function escolherMeses(novos: number) {
    setMeses(novos);
    const centavos = precos[chaveDoPreco("tempo", novos)];
    setValor(centavos ? centavosParaCampo(centavos) : "");
    aoMudar?.();
  }

  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(assinadoEm) && assinadoEm <= hoje;
  const vence = dataOk ? vencimentoDoPlano(assinadoEm, meses, coberturaAtual) : null;
  const encadeado = Boolean(vence && coberturaAtual && coberturaAtual > assinadoEm);

  return (
    <>
      <input type="hidden" name="meses" value={meses} />

      <div role="group" aria-label="Duração do plano" className="flex flex-wrap gap-2">
        {DURACOES_PLANO.map((d) => (
          <button
            key={d.meses}
            type="button"
            onClick={() => escolherMeses(d.meses)}
            aria-pressed={meses === d.meses}
            className={meses === d.meses ? "chip chip-selected" : "chip"}
          >
            {d.rotulo}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span className="label">Créditos no plano</span>
          <input
            name="qtd_imagens"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            value={imagens}
            onChange={(e) => setImagens(e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col">
          <span className="label">Valor total (R$)</span>
          <input
            name="valor_reais"
            inputMode="decimal"
            required
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
            className="input"
          />
        </label>
        <label className="flex flex-col">
          <span className="label">Contratado em</span>
          <input
            name="assinado_em"
            type="date"
            required
            max={hoje}
            value={assinadoEm}
            onChange={(e) => setAssinadoEm(e.target.value)}
            className="input"
          />
        </label>
        <label className="flex flex-col">
          <span className="label">Pagamento</span>
          <select name="metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)} className="input">
            {Object.entries(METODOS_PAGAMENTO).map(([chave, rotulo]) => (
              <option key={chave} value={chave}>
                {rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[13px] text-[var(--muted)]">
          {vence ? (
            <>
              Vence em <span className="font-medium text-[var(--foreground)]">{formatarDia(vence)}</span>
              {encadeado && <>, depois do plano atual, que acaba em {formatarDia(coberturaAtual!)}</>}.
            </>
          ) : (
            "Confira a data de contratação."
          )}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ja_pago" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
          Já pago
        </label>
      </div>
    </>
  );
}
