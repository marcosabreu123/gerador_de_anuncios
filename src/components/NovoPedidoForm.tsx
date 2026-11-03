"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lerRespostaJSON } from "@/lib/fetch-json";
import GerandoMensagem from "@/components/GerandoMensagem";
import type { PlanoPedido } from "@/lib/agencia/types";
import type { Formato } from "@/lib/types";

// Fluxo de pedido em duas etapas: descrever (texto ou áudio) -> conferir o
// plano -> aprovar. A conferência existe porque aprovar é o que gasta: se o
// agente entendeu errado o áudio, o erro aparece antes das gerações.

const FORMATOS: { valor: Formato; label: string }[] = [
  { valor: "feed-4-5", label: "Feed (4:5)" },
  { valor: "story-9-16", label: "Story (9:16)" },
  { valor: "quadrado-1-1", label: "Quadrado (1:1)" },
];

export default function NovoPedidoForm({
  clienteId,
  saldoDisponivel,
}: {
  clienteId: string;
  saldoDisponivel: number;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [plano, setPlano] = useState<PlanoPedido | null>(null);
  const [pedidoId, setPedidoId] = useState<string | null>(null);
  const [formato, setFormato] = useState<Formato>("feed-4-5");
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function iniciarGravacao() {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // Libera o microfone assim que termina — sem isso o indicador de
        // gravação do navegador fica aceso depois que o áudio já foi enviado.
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void enviarAudio(blob);
      };
      recorder.start();
      recorderRef.current = recorder;
      setGravando(true);
    } catch {
      setErro("Não consegui acessar o microfone. Você pode digitar o pedido abaixo.");
    }
  }

  function pararGravacao() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setGravando(false);
  }

  async function enviarAudio(blob: Blob) {
    setOcupado(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("clienteId", clienteId);
      form.append("audio", blob, "pedido.webm");
      const res = await fetch("/api/pedidos/planejar", { method: "POST", body: form });
      const json = await lerRespostaJSON<{ error?: string; pedido?: { id: string }; plano?: PlanoPedido }>(res);
      if (!res.ok || !json.plano || !json.pedido) throw new Error(json.error ?? "Erro ao planejar.");
      setPlano(json.plano);
      setPedidoId(json.pedido.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao enviar o áudio.");
    } finally {
      setOcupado(false);
    }
  }

  async function enviarTexto() {
    if (!texto.trim()) return;
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/pedidos/planejar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId, texto }),
      });
      const json = await lerRespostaJSON<{ error?: string; pedido?: { id: string }; plano?: PlanoPedido }>(res);
      if (!res.ok || !json.plano || !json.pedido) throw new Error(json.error ?? "Erro ao planejar.");
      setPlano(json.plano);
      setPedidoId(json.pedido.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao planejar o pedido.");
    } finally {
      setOcupado(false);
    }
  }

  async function aprovar(forcarSemSaldo = false) {
    if (!pedidoId) return;
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/pedidos/aprovar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedidoId, formato, forcarSemSaldo }),
      });
      const json = await lerRespostaJSON<{ error?: string; saldoInsuficiente?: boolean }>(res);
      if (!res.ok) {
        if (json.saldoInsuficiente) {
          setErro(`${json.error} Você pode aprovar mesmo assim se o cliente já combinou o pagamento.`);
          return;
        }
        throw new Error(json.error ?? "Erro ao aprovar.");
      }
      router.push(`/pedidos/${pedidoId}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao aprovar o pedido.");
      setOcupado(false);
    }
  }

  if (ocupado && !plano) {
    return (
      <div className="card p-6">
        <GerandoMensagem mensagens={["Ouvindo seu pedido…", "Separando as peças…", "Montando o plano…"]} />
      </div>
    );
  }

  if (plano) {
    const faltaSaldo = plano.pecas.length > saldoDisponivel;
    return (
      <div className="card p-4 flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Confira antes de produzir</h2>
          <p className="text-xs text-[var(--muted)] mt-0.5">{plano.resumo}</p>
        </div>

        <ol className="flex flex-col gap-2">
          {plano.pecas.map((peca, i) => (
            <li key={i} className="bg-[var(--surface-muted)] rounded-xl p-3">
              <p className="font-semibold text-sm">
                {i + 1}. {peca.titulo}
              </p>
              {peca.objetivo && <p className="text-xs text-[var(--muted)] mt-0.5">{peca.objetivo}</p>}
              <p className="text-sm mt-1">{peca.conteudo}</p>
            </li>
          ))}
        </ol>

        <label className="flex flex-col gap-1">
          <span className="label">Formato das peças</span>
          <select value={formato} onChange={(e) => setFormato(e.target.value as Formato)} className="input">
            {FORMATOS.map((f) => (
              <option key={f.valor} value={f.valor}>
                {f.label}
              </option>
            ))}
          </select>
        </label>

        <p className="text-xs text-[var(--muted)]">
          {plano.pecas.length} peça(s) · saldo do cliente: {saldoDisponivel} imagem(ns)
        </p>

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => aprovar(false)} disabled={ocupado} className="btn btn-primary">
            Aprovar e produzir
          </button>
          {faltaSaldo && (
            <button type="button" onClick={() => aprovar(true)} disabled={ocupado} className="btn btn-outline">
              Produzir mesmo sem saldo
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setPlano(null);
              setPedidoId(null);
              setErro(null);
            }}
            disabled={ocupado}
            className="btn btn-outline"
          >
            Refazer pedido
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">O que você precisa?</h2>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Fale ou escreva do seu jeito. Ex: &quot;cinco artes pra semana, segunda promoção de burger, terça
          dia do combo…&quot;
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {gravando ? (
          <button type="button" onClick={pararGravacao} className="btn btn-accent">
            ⏹ Parar e enviar
          </button>
        ) : (
          <button type="button" onClick={iniciarGravacao} className="btn btn-outline">
            🎙 Gravar áudio
          </button>
        )}
        {gravando && <span className="text-sm text-[var(--muted)] self-center">Gravando…</span>}
      </div>

      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        className="input min-h-[120px] resize-none"
        placeholder="Ou digite aqui o pedido completo."
        disabled={gravando}
      />

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

      <button
        type="button"
        onClick={enviarTexto}
        disabled={!texto.trim() || ocupado || gravando}
        className="btn btn-primary self-start"
      >
        Montar plano
      </button>
    </div>
  );
}
