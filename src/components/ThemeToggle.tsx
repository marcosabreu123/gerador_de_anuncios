"use client";

import { useEffect, useState } from "react";
import { applyTheme, readStoredTheme, storeTheme, type ThemePreference } from "@/lib/theme";

const ORDEM: ThemePreference[] = ["system", "light", "dark"];
const ICONE: Record<ThemePreference, string> = { system: "🖥️", light: "☀️", dark: "🌙" };
const LABEL: Record<ThemePreference, string> = { system: "Sistema", light: "Claro", dark: "Escuro" };

// Alterna claro/escuro/sistema num único botão (cicla nessa ordem a cada
// toque) — mantém o header compacto no mobile em vez de 3 botões separados.
export default function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference | null>(null);

  useEffect(() => {
    // localStorage só existe no client — lido depois do mount de propósito,
    // pra o HTML inicial bater com o SSR e não gerar mismatch de hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(readStoredTheme());
  }, []);

  function alternar() {
    if (!pref) return;
    const proximo = ORDEM[(ORDEM.indexOf(pref) + 1) % ORDEM.length];
    setPref(proximo);
    applyTheme(proximo);
    storeTheme(proximo);
  }

  // Evita mismatch de hidratação/flash: só renderiza o ícone real depois de
  // ler a preferência no client, mas reserva o mesmo espaço antes disso.
  if (!pref) return <span className="w-9 h-9 shrink-0" aria-hidden="true" />;

  return (
    <button
      type="button"
      onClick={alternar}
      className="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] text-base leading-none"
      aria-label={`Tema: ${LABEL[pref]}. Toque para alternar.`}
      title={`Tema: ${LABEL[pref]} (toque para alternar)`}
    >
      {ICONE[pref]}
    </button>
  );
}
