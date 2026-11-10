"use client";

import { useFormStatus } from "react-dom";

// Botão de formulário com ação de servidor. Sem isto o clique em "Salvar" não dá
// sinal nenhum até a tela recarregar, e o operador clica de novo.
export default function BotaoEnviar({
  className = "btn btn-primary",
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className} title={title}>
      {pending && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}
