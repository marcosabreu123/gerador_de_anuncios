"use client";

import CamposPlano from "@/components/CamposPlano";

export type ModoCadastro = "plano" | "teste";

// Como o cliente novo entra: com o primeiro plano, de 1 mês no mínimo, ou em teste,
// sem plano e sem pagamento. Igual no cadastro à mão e no cadastro com IA.
//
// Os campos levam nome: quem envia é o formulário em volta, pelo FormData.
export default function ComoEntra({
  modo,
  aoMudar,
  hoje,
  precos,
}: {
  modo: ModoCadastro;
  aoMudar: (modo: ModoCadastro) => void;
  hoje: string;
  precos: Record<string, number>;
}) {
  return (
    <fieldset className="flex flex-col gap-3.5 min-w-0">
      <legend className="text-[13px] font-semibold mb-3">Como entra</legend>
      <input type="hidden" name="modo" value={modo} />
      <div
        role="group"
        aria-label="Como o cliente entra"
        className="grid grid-cols-2 gap-0.5 p-0.5 rounded-[10px] bg-[var(--surface-muted)]"
      >
        <Segmento ativo={modo === "plano"} onClick={() => aoMudar("plano")}>
          Com plano
        </Segmento>
        <Segmento ativo={modo === "teste"} onClick={() => aoMudar("teste")}>
          Em teste
        </Segmento>
      </div>

      {modo === "plano" ? (
        <CamposPlano hoje={hoje} precos={precos} />
      ) : (
        <div className="quadro p-3.5 text-[13px] text-[var(--muted)] flex flex-col gap-1.5">
          <p className="font-medium text-[var(--foreground)]">Sem plano e sem pagamento.</p>
          <p>
            Produz sem usar crédito e fica fora da receita e das cobranças. O custo dele aparece à parte no Painel.
          </p>
          <p>Quando ele começar a pagar, registre o primeiro plano na página dele: isso tira o cliente do teste.</p>
        </div>
      )}
    </fieldset>
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
