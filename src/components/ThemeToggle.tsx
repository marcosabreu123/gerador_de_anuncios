"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { applyTheme, readStoredTheme, storeTheme, type ThemePreference } from "@/lib/theme";

const ORDEM: ThemePreference[] = ["system", "light", "dark"];
const ICONE: Record<ThemePreference, LucideIcon> = { system: Monitor, light: Sun, dark: Moon };
const LABEL: Record<ThemePreference, string> = { system: "Sistema", light: "Claro", dark: "Escuro" };

// Duas formas para a mesma escolha: no menu lateral cabem as três opções à
// vista; no topo do celular, um botão só que cicla entre elas a cada toque.
export default function ThemeToggle({ variante }: { variante: "seletor" | "botao" }) {
  const [pref, setPref] = useState<ThemePreference | null>(null);

  useEffect(() => {
    // localStorage só existe no client — lido depois do mount de propósito,
    // pra o HTML inicial bater com o SSR e não gerar mismatch de hidratação.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPref(readStoredTheme());
  }, []);

  function escolher(proximo: ThemePreference) {
    setPref(proximo);
    applyTheme(proximo);
    storeTheme(proximo);
  }

  if (variante === "seletor") {
    return (
      <div className="flex gap-0.5 p-0.5 rounded-[10px] bg-[var(--surface-muted)]" role="group" aria-label="Tema">
        {ORDEM.map((opcao) => {
          const Icone = ICONE[opcao];
          const ativo = pref === opcao;
          return (
            <button
              key={opcao}
              type="button"
              onClick={() => escolher(opcao)}
              aria-pressed={ativo}
              title={LABEL[opcao]}
              className={`flex-1 flex items-center justify-center h-7 rounded-lg transition-colors ${
                ativo
                  ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Icone size={14} aria-hidden="true" />
              <span className="sr-only">{LABEL[opcao]}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // Evita mismatch de hidratação/flash: só renderiza o ícone real depois de
  // ler a preferência no client, mas reserva o mesmo espaço antes disso.
  if (!pref) return <span className="w-9 h-9 shrink-0" aria-hidden="true" />;

  const Icone = ICONE[pref];
  return (
    <button
      type="button"
      onClick={() => escolher(ORDEM[(ORDEM.indexOf(pref) + 1) % ORDEM.length])}
      className="btn btn-ghost btn-icone"
      aria-label={`Tema: ${LABEL[pref]}. Toque para alternar.`}
      title={`Tema: ${LABEL[pref]} (toque para alternar)`}
    >
      <Icone size={16} aria-hidden="true" />
    </button>
  );
}
