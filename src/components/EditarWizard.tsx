"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lerRespostaJSON } from "@/lib/fetch-json";
import AjusteConversa, { type ConfirmacaoAjuste } from "@/components/AjusteConversa";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

export default function EditarWizard() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
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

  // Chamado pela mini conversa de ajuste (AjusteConversa) só quando o pedido
  // já está claro e o usuário confirmou — 1 crédito é cobrado aqui dentro de
  // /api/edit-design, nunca durante a conversa de esclarecimento.
  async function aplicar({ pedidoFinal, anexoUrl, tipoUsoAnexo }: ConfirmacaoAjuste) {
    if (!originalUrl) return;
    const res = await fetch("/api/edit-design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalUrl, pedido: pedidoFinal, anexoUrl, tipoUsoAnexo }),
    });
    const json = await lerRespostaJSON<{ error?: string; projectId?: string }>(res);
    if (!res.ok || !json.projectId) throw new Error(json.error ?? "Erro ao editar.");
    router.push(`/resultado/${json.projectId}`);
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

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

      {originalUrl && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm mb-1">O que você quer mudar?</h3>
          <p className="text-xs text-[var(--muted)] mb-3">
            Escreva com suas palavras. A edição confirmada usa 1 crédito.
          </p>
          <AjusteConversa onConfirmar={aplicar} labelGerar="Aplicar edição (1 crédito)" sugestoes={sugestoes} />
        </div>
      )}
    </div>
  );
}
