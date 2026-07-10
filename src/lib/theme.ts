// Modo claro/escuro/sistema — client-safe, sem dependências. O tema
// aplicado de fato é um atributo `data-theme` em <html>: presente = força
// claro/escuro (ver globals.css); ausente = segue `prefers-color-scheme`
// do sistema automaticamente. A escolha do usuário fica em localStorage.

export type ThemePreference = "light" | "dark" | "system";

const CHAVE_STORAGE = "theme";

export function readStoredTheme(): ThemePreference {
  try {
    const v = localStorage.getItem(CHAVE_STORAGE);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // localStorage indisponível (modo privado etc.) — segue o sistema.
  }
  return "system";
}

export function storeTheme(pref: ThemePreference): void {
  try {
    localStorage.setItem(CHAVE_STORAGE, pref);
  } catch {
    // Sem persistência disponível — a escolha vale só pra sessão atual.
  }
}

export function applyTheme(pref: ThemePreference): void {
  const root = document.documentElement;
  if (pref === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", pref);
  }
}

// Script inline (roda antes do primeiro paint, ver layout.tsx) — precisa
// ser uma string autocontida, sem imports, porque executa antes do React
// hidratar. Mantém sincronizado com a lógica acima.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('${CHAVE_STORAGE}');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;
