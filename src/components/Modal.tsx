"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Usa o <dialog> nativo: foco preso dentro, Esc para fechar e camada acima de
// tudo vêm do navegador, sem nada para manter aqui.
export default function Modal({
  titulo,
  aoFechar,
  largo = false,
  children,
}: {
  titulo: string;
  aoFechar: () => void;
  largo?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className={largo ? "modal modal-largo" : "modal"}
      aria-label={titulo}
      onClose={aoFechar}
      onClick={(e) => {
        // O clique no fundo chega com o próprio dialog como alvo.
        if (e.target === ref.current) aoFechar();
      }}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold tracking-[-0.01em]">{titulo}</h2>
          <button type="button" onClick={aoFechar} className="btn btn-ghost btn-icone" aria-label="Fechar">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
