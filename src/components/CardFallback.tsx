"use client";

import { useState } from "react";

// Fallback do card de perguntas agrupadas (ver CardBoundary.tsx): sem
// botões estruturados, mas nunca deixa o lojista sem conseguir responder e
// continuar o fluxo.
export default function CardFallback({
  titulo,
  onEnviarTexto,
  enviando,
}: {
  titulo: string;
  onEnviarTexto: (texto: string) => void;
  enviando: boolean;
}) {
  const [texto, setTexto] = useState("");

  return (
    <div className="card p-4 flex flex-col gap-3">
      <h3 className="font-semibold text-sm">{titulo}</h3>
      <p className="text-xs text-[var(--muted)]">
        Não consegui montar as opções em botões agora — escreva sua resposta livremente que a gente continua.
      </p>
      <textarea
        className="input min-h-[70px] resize-none"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva sua resposta..."
        disabled={enviando}
      />
      <button
        type="button"
        className="btn btn-accent btn-block"
        disabled={!texto.trim() || enviando}
        onClick={() => onEnviarTexto(texto.trim())}
      >
        {enviando ? "Enviando…" : "Enviar respostas"}
      </button>
    </div>
  );
}
