"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ESTILOS,
  FORMATOS,
  type BriefingProduto,
  type Estilo,
  type Formato,
} from "@/lib/types";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";
const TOTAL_PASSOS = 4;

export default function NovoWizard() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [passo, setPasso] = useState(0);
  const [erro, setErro] = useState<string | null>(null);

  // Estado do briefing
  const [preview, setPreview] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [formato, setFormato] = useState<Formato | null>(null);
  const [estilo, setEstilo] = useState<Estilo | null>(null);
  const [infos, setInfos] = useState<BriefingProduto>({ nomeProduto: "" });
  const [gerando, setGerando] = useState(false);

  async function onSelecionarFoto(e: React.ChangeEvent<HTMLInputElement>) {
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
      const path = `${user.id}/originais/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setOriginalUrl(data.publicUrl);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar a foto.");
      setPreview(null);
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function gerar() {
    if (!originalUrl || !formato || !estilo || !infos.nomeProduto.trim()) return;
    setGerando(true);
    setErro(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originalUrl,
          briefing: { ...infos, formato, estilo },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao gerar.");
      router.push(`/resultado/${json.projectId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar a arte.");
      setGerando(false);
    }
  }

  const podeAvancar =
    (passo === 0 && !!originalUrl && !enviandoFoto) ||
    (passo === 1 && !!formato) ||
    (passo === 2 && !!estilo) ||
    (passo === 3 && infos.nomeProduto.trim().length > 0);

  return (
    <div className="flex flex-col flex-1">
      {/* Barra de progresso */}
      <div className="flex gap-1.5 mb-6">
        {Array.from({ length: TOTAL_PASSOS }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i <= passo ? "bg-[var(--accent)]" : "bg-[var(--border)]"
            }`}
          />
        ))}
      </div>

      {/* PASSO 0 — Foto */}
      {passo === 0 && (
        <section>
          <h2 className="text-lg font-bold">Envie a foto do produto</h2>
          <p className="text-sm text-[var(--muted)] mt-1 mb-4">
            Uma foto simples já serve. A IA cuida do resto.
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="card w-full aspect-square flex flex-col items-center justify-center gap-2 border-dashed overflow-hidden"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Prévia" className="w-full h-full object-cover" />
            ) : (
              <>
                <span className="text-4xl">📷</span>
                <span className="text-sm text-[var(--muted)]">Toque para escolher a foto</span>
              </>
            )}
          </button>
          {enviandoFoto && <p className="text-sm text-[var(--muted)] mt-2">Enviando foto…</p>}
          {originalUrl && !enviandoFoto && (
            <p className="text-sm text-green-700 mt-2">Foto enviada ✓</p>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onSelecionarFoto}
            className="hidden"
          />
        </section>
      )}

      {/* PASSO 1 — Formato */}
      {passo === 1 && (
        <section>
          <h2 className="text-lg font-bold">Qual o formato da arte?</h2>
          <p className="text-sm text-[var(--muted)] mt-1 mb-4">Onde você vai postar?</p>
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(FORMATOS) as Formato[]).map((f) => {
              const info = FORMATOS[f];
              const sel = formato === f;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormato(f)}
                  className={`card p-3 flex flex-col items-center gap-2 ${
                    sel ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : ""
                  }`}
                >
                  <div className={`w-full ${info.ratio} bg-[var(--accent-soft)] rounded-md`} />
                  <span className="text-sm font-semibold">{info.label}</span>
                  <span className="text-[11px] text-[var(--muted)]">{info.aspecto}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* PASSO 2 — Estilo */}
      {passo === 2 && (
        <section>
          <h2 className="text-lg font-bold">Escolha o estilo visual</h2>
          <p className="text-sm text-[var(--muted)] mt-1 mb-4">O clima da sua arte.</p>
          <div className="grid grid-cols-2 gap-3">
            {(Object.keys(ESTILOS) as Estilo[]).map((s) => {
              const info = ESTILOS[s];
              const sel = estilo === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setEstilo(s)}
                  className={`card p-4 text-left ${
                    sel ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : ""
                  }`}
                >
                  <span className="text-sm font-semibold block">{info.label}</span>
                  <span className="text-xs text-[var(--muted)]">{info.descricao}</span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* PASSO 3 — Informações */}
      {passo === 3 && (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold">Informações do produto</h2>
            <p className="text-sm text-[var(--muted)] mt-1">Só o nome é obrigatório.</p>
          </div>
          <div>
            <label className="label">Nome do produto *</label>
            <input
              className="input"
              value={infos.nomeProduto}
              onChange={(e) => setInfos({ ...infos, nomeProduto: e.target.value })}
              placeholder="Ex: Salvo Intense"
            />
          </div>
          <div>
            <label className="label">Preço</label>
            <input
              className="input"
              value={infos.preco ?? ""}
              onChange={(e) => setInfos({ ...infos, preco: e.target.value })}
              placeholder="Ex: R$ 229,99"
            />
          </div>
          <div>
            <label className="label">Frase / gancho</label>
            <input
              className="input"
              value={infos.frase ?? ""}
              onChange={(e) => setInfos({ ...infos, frase: e.target.value })}
              placeholder="Ex: Inspirado no Dior Sauvage"
            />
          </div>
          <div>
            <label className="label">Benefício principal</label>
            <input
              className="input"
              value={infos.beneficio ?? ""}
              onChange={(e) => setInfos({ ...infos, beneficio: e.target.value })}
              placeholder="Ex: Fixação de 12 horas"
            />
          </div>
          <div>
            <label className="label">Chamada (WhatsApp)</label>
            <input
              className="input"
              value={infos.chamadaWhatsapp ?? ""}
              onChange={(e) => setInfos({ ...infos, chamadaWhatsapp: e.target.value })}
              placeholder="Ex: Peça já no WhatsApp"
            />
          </div>
        </section>
      )}

      {erro && <p className="text-sm text-[var(--danger)] mt-4">{erro}</p>}

      {/* Navegação */}
      <div className="mt-auto pt-8 flex gap-3">
        {passo > 0 && (
          <button
            type="button"
            onClick={() => setPasso((p) => p - 1)}
            disabled={gerando}
            className="btn btn-outline"
          >
            Voltar
          </button>
        )}
        {passo < TOTAL_PASSOS - 1 ? (
          <button
            type="button"
            onClick={() => setPasso((p) => p + 1)}
            disabled={!podeAvancar}
            className="btn btn-primary btn-block"
          >
            Continuar
          </button>
        ) : (
          <button
            type="button"
            onClick={gerar}
            disabled={!podeAvancar || gerando}
            className="btn btn-accent btn-block"
          >
            {gerando ? "Gerando artes…" : "Gerar minhas artes ✨"}
          </button>
        )}
      </div>

      {gerando && (
        <p className="text-center text-xs text-[var(--muted)] mt-4">
          Isso pode levar alguns segundos. Estamos criando 3 variações.
        </p>
      )}
    </div>
  );
}
