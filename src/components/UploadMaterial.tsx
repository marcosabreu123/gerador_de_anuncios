"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { enviarImagemParaStorage } from "@/lib/upload-storage";
import { TIPOS_REFERENCIA, type TipoReferencia } from "@/lib/agencia/types";

// Upload dos materiais do cliente (logo, foto de produto, referência).
//
// Antes só dava para colar URL, o que na prática inviabilizava o cadastro:
// ninguém vai hospedar a logo de 50 clientes em outro lugar para colar o link
// aqui. O arquivo vai direto do navegador para o Storage e só a URL pública
// volta para o banco — o servidor não precisa intermediar bytes de imagem.
export default function UploadMaterial({ clienteId }: { clienteId: string }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoReferencia>("logo");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function enviar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    if (arquivos.length === 0) return;

    setEnviando(true);
    setErro(null);

    try {
      for (const arquivo of arquivos) {
        const url = await enviarImagemParaStorage(arquivo, `clientes/${clienteId}/${tipo}`);

        const resposta = await fetch("/api/referencias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clienteId,
            tipo,
            url,
            descricao: arquivo.name,
          }),
        });
        if (!resposta.ok) throw new Error("Imagem enviada, mas não consegui registrar no cliente.");
      }

      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no envio.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TIPOS_REFERENCIA) as TipoReferencia[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            className={tipo === t ? "chip chip-selected" : "chip"}
          >
            {TIPOS_REFERENCIA[t].label}
          </button>
        ))}
      </div>

      <p className="text-xs text-[var(--muted)]">{TIPOS_REFERENCIA[tipo].ajuda}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={enviar}
        disabled={enviando}
        className="hidden"
        id={`upload-${clienteId}`}
      />
      <label
        htmlFor={`upload-${clienteId}`}
        className={`btn btn-outline self-start ${enviando ? "opacity-60 pointer-events-none" : ""}`}
      >
        {enviando ? "Enviando…" : `Enviar ${TIPOS_REFERENCIA[tipo].label.toLowerCase()}`}
      </label>

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
    </div>
  );
}
