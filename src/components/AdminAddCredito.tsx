"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminAddCredito({ userId }: { userId: string }) {
  const router = useRouter();
  const [quantidade, setQuantidade] = useState("10");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function adicionar() {
    const valor = Number(quantidade);
    if (!Number.isInteger(valor) || valor === 0) {
      setErro("Informe um número inteiro.");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch("/api/admin/add-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, quantidade: valor }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao adicionar créditos.");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao adicionar créditos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        className="input w-20 py-1.5 text-sm"
        value={quantidade}
        onChange={(e) => setQuantidade(e.target.value)}
      />
      <button
        onClick={adicionar}
        disabled={enviando}
        className="text-xs font-semibold bg-[var(--accent-soft)] px-3 py-1.5 rounded-full disabled:opacity-50"
      >
        {enviando ? "…" : "Adicionar"}
      </button>
      {erro && <span className="text-xs text-[var(--danger)]">{erro}</span>}
    </div>
  );
}
