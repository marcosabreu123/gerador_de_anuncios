"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { venderPacote } from "@/app/(app)/clientes/actions";
import { formatarDia } from "@/lib/datas";
import {
  DURACOES_PLANO,
  IMAGENS_POR_PLANO,
  chaveDoPreco,
  duracaoValida,
  vencimentoDoPlano,
} from "@/lib/agencia/cobrancas";
import {
  METODOS_PAGAMENTO,
  centavosParaCampo,
  reaisParaCentavos,
  type TipoPacote,
} from "@/lib/agencia/types";

// Plano que o botão "Renovar" manda repetir: duração, imagens e valor vêm dele.
export interface RenovacaoPlano {
  id: string;
  nome: string;
  meses: number;
  qtdImagens: number;
  valorCentavos: number;
}

// Venda de plano por tempo ou de pacote avulso. O vencimento aparece antes de
// salvar, calculado com a mesma regra do servidor, para o sócio conferir com o
// que combinou com o cliente.
//
// Envio por onSubmit, não pela prop action: depois de uma action o React limpa o
// formulário, e o select controlado voltava para Pix na tela com Cartão no estado.
export default function FormVenderPacote({
  clienteId,
  hoje,
  coberturaAtual,
  precos,
  renovacao,
  mesesSugeridos,
}: {
  clienteId: string;
  hoje: string;
  // Vencimento do plano em vigor: o plano novo começa quando ele acaba.
  coberturaAtual: string | null;
  // Último valor cobrado em cada modalidade (ver precosSugeridos).
  precos: Record<string, number>;
  renovacao?: RenovacaoPlano | null;
  // Duração do plano atual do cliente: quem paga por trimestre costuma renovar por trimestre.
  mesesSugeridos?: number | null;
}) {
  const router = useRouter();
  const formulario = useRef<HTMLFormElement>(null);
  const [enviando, iniciarEnvio] = useTransition();

  // "Renovar" fica no histórico (abaixo do formulário no celular) e no aviso do
  // topo (acima dele): sem rolar até aqui, o clique parecia não fazer nada. A aba
  // pode ainda estar escondida quando o formulário monta, porque Abas lê o
  // #pacotes depois; o observador espera o formulário ganhar tamanho. "nearest"
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
  const [tipo, setTipo] = useState<TipoPacote>("tempo");
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
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<string | null>(null);

  // Cada modalidade lembra o próprio preço: trocar de 1 mês para Anual troca o valor.
  function sugerirValor(novoTipo: TipoPacote, novosMeses: number) {
    const centavos = precos[chaveDoPreco(novoTipo, novosMeses)];
    setValor(centavos ? centavosParaCampo(centavos) : "");
  }

  function escolherTipo(novo: TipoPacote) {
    if (novo === tipo) return;
    setTipo(novo);
    sugerirValor(novo, meses);
    setFeito(null);
  }

  function escolherMeses(novos: number) {
    setMeses(novos);
    sugerirValor("tempo", novos);
    setFeito(null);
  }

  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(assinadoEm) && assinadoEm <= hoje;
  const vence = tipo === "tempo" && dataOk ? vencimentoDoPlano(assinadoEm, meses, coberturaAtual) : null;
  const encadeado = Boolean(vence && coberturaAtual && coberturaAtual > assinadoEm);

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    setFeito(null);
    if (reaisParaCentavos(valor) === null) {
      setErro("Informe o valor cobrado.");
      return;
    }
    if (!dataOk) {
      setErro("A data de assinatura não pode ser depois de hoje.");
      return;
    }
    const dados = new FormData(evento.currentTarget);
    iniciarEnvio(async () => {
      const resultado = await venderPacote(dados);
      if (resultado.erro) {
        setErro(resultado.erro);
        return;
      }
      setFeito(tipo === "tempo" ? "Plano registrado." : "Pacote registrado.");
      // Sem o ?renovar no endereço, um segundo clique não renova de novo o mesmo plano.
      if (renovacao) router.replace(`/clientes/${clienteId}#pacotes`, { scroll: false });
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
      <input type="hidden" name="tipo" value={tipo} />
      {tipo === "tempo" && <input type="hidden" name="meses" value={meses} />}

      <div role="group" aria-label="O que vender" className="grid grid-cols-2 gap-0.5 p-0.5 rounded-[10px] bg-[var(--surface-muted)]">
        <Segmento ativo={tipo === "tempo"} onClick={() => escolherTipo("tempo")}>
          Plano por tempo
        </Segmento>
        <Segmento ativo={tipo === "imagens"} onClick={() => escolherTipo("imagens")}>
          Pacote de imagens
        </Segmento>
      </div>

      {tipo === "tempo" && (
        <div role="group" aria-label="Duração do plano" className="flex flex-wrap gap-2">
          {DURACOES_PLANO.map((d) => (
            <Opcao key={d.meses} ativa={meses === d.meses} onClick={() => escolherMeses(d.meses)}>
              {d.rotulo}
            </Opcao>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col">
          <span className="label">{tipo === "tempo" ? "Imagens no plano" : "Imagens"}</span>
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
          <span className="label">Assinado em</span>
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

      <p className="text-[13px] text-[var(--muted)]">
        {tipo === "imagens" ? (
          "As imagens do pacote não vencem."
        ) : vence ? (
          <>
            Vence em <span className="font-medium text-[var(--foreground)]">{formatarDia(vence)}</span>
            {encadeado && <>, depois do plano atual, que acaba em {formatarDia(coberturaAtual!)}</>}.
          </>
        ) : (
          "Confira a data de assinatura."
        )}
      </p>

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
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ja_pago" checked={jaPago} onChange={(e) => setJaPago(e.target.checked)} />
          Já pago
        </label>
        <button type="submit" disabled={enviando} className="btn btn-primary">
          {enviando && <span className="spinner" aria-hidden="true" />}
          {tipo === "tempo" ? "Registrar plano" : "Vender pacote"}
        </button>
      </div>
    </form>
  );
}

// Mesmo desenho do seletor de tema: duas escolhas que se excluem.
function Segmento({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`h-8 rounded-lg text-[13px] font-medium transition-colors ${
        ativo
          ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
          : "text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {children}
    </button>
  );
}

function Opcao({
  ativa,
  onClick,
  children,
}: {
  ativa: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativa} className={ativa ? "chip chip-selected" : "chip"}>
      {children}
    </button>
  );
}
