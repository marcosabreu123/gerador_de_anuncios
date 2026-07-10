"use client";

import { useEffect, useState } from "react";

const MENSAGENS_PADRAO = ["Criando sua arte…", "Ajustando composição…", "Refinando detalhes…"];

// Texto rotativo pros estados de carregamento mais longos (geração de
// imagem, 30-90s) — mais amigável que um "Gerando…" estático parado.
export default function GerandoMensagem({
  mensagens = MENSAGENS_PADRAO,
  intervalMs = 2600,
}: {
  mensagens?: string[];
  intervalMs?: number;
}) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndice((i) => (i + 1) % mensagens.length), intervalMs);
    return () => clearInterval(id);
  }, [mensagens, intervalMs]);

  return (
    <span className="inline-flex items-center gap-2">
      <span className="spinner" aria-hidden="true" />
      {mensagens[indice]}
    </span>
  );
}
