"use client";

import { useState } from "react";
import type { CardPerguntas } from "@/lib/types";
import { formatarRespostasCard } from "@/lib/briefing-card";

// Card de perguntas agrupadas: cada grupo é um radio-group independente
// (uma opção por grupo, sem enviar nada a cada clique). Só quando o usuário
// clica no botão final é que a resposta consolidada (todos os grupos + os
// campos condicionais) vira UMA mensagem só na conversa — é isso que reduz
// as chamadas ao modelo e resolve o problema de "pergunta dupla, só dá pra
// responder uma parte" do fluxo antigo (uma pergunta por vez).
export default function CardAgrupado({
  card,
  camposCondicionais = {},
  onEnviar,
  enviando = false,
}: {
  card: CardPerguntas;
  camposCondicionais?: Record<string, { label: string; placeholder: string }>;
  onEnviar: (texto: string, selecoes: Record<string, string>, camposTexto: Record<string, string>) => void;
  enviando?: boolean;
}) {
  const [selecoes, setSelecoes] = useState<Record<string, string>>({});
  const [camposTexto, setCamposTexto] = useState<Record<string, string>>({});

  function escolher(grupoId: string, value: string) {
    setSelecoes((prev) => ({ ...prev, [grupoId]: value }));
  }

  function camposObrigatoriosPendentes(): boolean {
    return card.grupos.some((g) => {
      const valor = selecoes[g.id];
      if (!valor) return true;
      const condicional = camposCondicionais[`${g.id}:${valor}`];
      return !!condicional && !camposTexto[`${g.id}:${valor}`]?.trim();
    });
  }

  function enviar() {
    if (camposObrigatoriosPendentes() || enviando) return;
    onEnviar(formatarRespostasCard(card, selecoes, camposTexto), selecoes, camposTexto);
  }

  return (
    <div className="card p-4 flex flex-col gap-4">
      <h3 className="font-semibold text-sm">{card.titulo}</h3>

      {card.grupos.map((g) => {
        const valorEscolhido = selecoes[g.id];
        const condicional = valorEscolhido ? camposCondicionais[`${g.id}:${valorEscolhido}`] : undefined;
        return (
          <div key={g.id} className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-[var(--muted)]">{g.pergunta}</p>
            <div className="flex flex-wrap gap-2">
              {g.opcoes.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => escolher(g.id, o.value)}
                  disabled={enviando}
                  className={`text-sm font-medium px-3 py-1.5 rounded-full ${
                    valorEscolhido === o.value
                      ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                      : "bg-[var(--accent-soft)]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {condicional && (
              <div className="flex flex-col gap-1">
                <p className="text-xs text-[var(--muted)]">{condicional.label}</p>
                <input
                  type="text"
                  className="input"
                  placeholder={condicional.placeholder}
                  value={camposTexto[`${g.id}:${valorEscolhido}`] ?? ""}
                  onChange={(e) =>
                    setCamposTexto((prev) => ({ ...prev, [`${g.id}:${valorEscolhido}`]: e.target.value }))
                  }
                  disabled={enviando}
                />
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={enviar}
        disabled={camposObrigatoriosPendentes() || enviando}
        className="btn btn-accent btn-block"
      >
        {enviando ? "Enviando…" : card.botaoEnviar}
      </button>
    </div>
  );
}
