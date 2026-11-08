"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
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
  // Logo de parceiro é acionada pelo nome que o pedido cita (ver logo-parceiro.ts).
  const [nomeParceiro, setNomeParceiro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const parceiro = tipo === "logo_parceiro";
  const faltaNome = parceiro && !nomeParceiro.trim();

  async function enviar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    if (arquivos.length === 0 || faltaNome) return;

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
            descricao: parceiro ? nomeParceiro.trim() : arquivo.name,
          }),
        });
        if (!resposta.ok) throw new Error("Imagem enviada, mas não consegui registrar no cliente.");
      }

      if (parceiro) setNomeParceiro("");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha no envio.");
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(TIPOS_REFERENCIA) as TipoReferencia[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTipo(t)}
            aria-pressed={tipo === t}
            className={tipo === t ? "chip chip-selected" : "chip"}
          >
            {TIPOS_REFERENCIA[t].label}
          </button>
        ))}
      </div>

      <p className="text-[13px] text-[var(--muted)]">{TIPOS_REFERENCIA[tipo].ajuda}</p>

      {parceiro && (
        <label className="flex flex-col">
          <span className="label">Nome que aciona a logo</span>
          <input
            value={nomeParceiro}
            onChange={(e) => setNomeParceiro(e.target.value)}
            className="input"
            placeholder="Ex: CNH do Brasil"
            maxLength={60}
          />
        </label>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={!parceiro}
        onChange={enviar}
        disabled={enviando || faltaNome}
        className="hidden"
        id={`upload-${clienteId}`}
      />
      <label
        htmlFor={`upload-${clienteId}`}
        aria-disabled={faltaNome}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-7 text-center text-sm font-medium cursor-pointer hover:bg-[var(--surface-muted)] transition-colors ${
          enviando || faltaNome ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        {enviando ? <span className="spinner" aria-hidden="true" /> : <Upload size={18} className="text-[var(--muted)]" aria-hidden="true" />}
        {enviando
          ? "Enviando…"
          : faltaNome
            ? "Escreva o nome antes de enviar"
            : `Enviar ${TIPOS_REFERENCIA[tipo].label.toLowerCase()}`}
      </label>

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}
    </div>
  );
}
