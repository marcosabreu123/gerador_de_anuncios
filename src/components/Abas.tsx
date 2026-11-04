"use client";

import { useEffect, useState, type ReactNode } from "react";

export interface Aba {
  id: string;
  rotulo: string;
  conteudo: ReactNode;
}

// As abas só escondem o painel, sem desmontar: o que foi digitado num formulário
// continua lá se o operador trocar de aba antes de salvar. O id vai para o
// endereço para dar para abrir direto numa aba (#identidade, por exemplo).
export default function Abas({ abas }: { abas: Aba[] }) {
  const [ativa, setAtiva] = useState(abas[0].id);

  useEffect(() => {
    // O hash só existe no client: lido depois do mount para bater com o SSR.
    const pedida = window.location.hash.slice(1);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (abas.some((a) => a.id === pedida)) setAtiva(pedida);
  }, [abas]);

  function abrir(id: string) {
    setAtiva(id);
    window.history.replaceState(null, "", `#${id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="abas" role="tablist">
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            role="tab"
            id={`aba-${aba.id}`}
            aria-selected={aba.id === ativa}
            aria-controls={`painel-${aba.id}`}
            onClick={() => abrir(aba.id)}
            className="aba"
          >
            {aba.rotulo}
          </button>
        ))}
      </div>

      {abas.map((aba) => (
        <div
          key={aba.id}
          id={`painel-${aba.id}`}
          role="tabpanel"
          aria-labelledby={`aba-${aba.id}`}
          hidden={aba.id !== ativa}
        >
          {aba.conteudo}
        </div>
      ))}
    </div>
  );
}
