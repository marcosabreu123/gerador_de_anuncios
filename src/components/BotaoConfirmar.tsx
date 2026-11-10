"use client";

import { useFormStatus } from "react-dom";

// Botão de formulário que pergunta antes de enviar. Para ação que a tela não
// desfaz, como cancelar um plano: um clique sem querer não pode custar o saldo
// do cliente.
export default function BotaoConfirmar({
  pergunta,
  className = "btn btn-outline",
  children,
}: {
  pergunta: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={className}
      onClick={(e) => {
        if (!window.confirm(pergunta)) e.preventDefault();
      }}
    >
      {pending && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
