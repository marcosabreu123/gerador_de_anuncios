"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

export default function EditarWizard() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [pedido, setPedido] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function onSelecionarDesign(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(null);
    setPreview(URL.createObjectURL(file));
    setEnviandoFoto(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Faça login novamente.");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/originais/edicao/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setOriginalUrl(data.publicUrl);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar o design.");
      setPreview(null);
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function aplicar() {
    if (!originalUrl || !pedido.trim()) return;
    setAplicando(true);
    setErro(null);
    try {
      const res = await fetch("/api/edit-design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ originalUrl, pedido }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao editar.");
      router.push(`/resultado/${json.projectId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao editar o design.");
      setAplicando(false);
    }
  }

  const sugestoes = [
    "Troque o preço para R$ 39,90",
    "Deixe o fundo mais escuro",
    "Aumente o tamanho do texto principal",
    "Mude a cor do texto para branco",
  ];

  return (
    <div className="flex flex-col flex-1 gap-5">
      <div>
        <h2 className="text-lg font-bold">Envie o design que quer editar</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Pode ser uma arte que você já tem pronta, feita aqui ou em outro lugar.
        </p>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="card w-full aspect-square flex flex-col items-center justify-center gap-2 border-dashed overflow-hidden"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Design enviado" className="w-full h-full object-contain" />
        ) : (
          <>
            <span className="text-4xl">🖼️</span>
            <span className="text-sm text-[var(--muted)]">Toque para escolher o design</span>
          </>
        )}
      </button>
      {enviandoFoto && <p className="text-sm text-[var(--muted)]">Enviando…</p>}
      {originalUrl && !enviandoFoto && <p className="text-sm text-green-700">Design enviado ✓</p>}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        onChange={onSelecionarDesign}
        className="hidden"
      />

      {originalUrl && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm">O que você quer mudar?</h3>
          <p className="text-xs text-[var(--muted)] mt-1 mb-3">
            Escreva com suas palavras. Isso usa 1 crédito.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {sugestoes.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setPedido(s)}
                className="text-xs bg-[var(--accent-soft)] px-3 py-1.5 rounded-full"
              >
                {s}
              </button>
            ))}
          </div>
          <textarea
            className="input min-h-[80px] resize-none"
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            placeholder="Ex: troque a frase para 'Promoção de verão' e deixe o fundo azul"
          />
        </div>
      )}

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

      <button
        type="button"
        onClick={aplicar}
        disabled={!originalUrl || !pedido.trim() || aplicando}
        className="btn btn-accent btn-block mt-auto"
      >
        {aplicando ? "Aplicando edição…" : "Aplicar edição ✨"}
      </button>
    </div>
  );
}
