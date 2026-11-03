"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lerRespostaJSON } from "@/lib/fetch-json";
import GerandoMensagem from "@/components/GerandoMensagem";
import type { EstiloComunicacao, Formato, IntensidadeVisual } from "@/lib/types";

// Tela de produção. O operador escreve ou fala o pedido, ajusta os controles
// e manda gerar — sem etapa intermediária de aprovar plano.
//
// Os controles existem porque o agente não deve adivinhar o que é decisão do
// operador: quantidade, formato e intensidade são escolha de quem conhece o
// cliente. O que o agente faz é ler o perfil da empresa (identidade, nicho,
// regras, materiais) e traduzir o pedido em direção de arte.

const QUANTIDADES = [1, 2, 3, 4] as const;

const FORMATOS: { valor: Formato; label: string; ajuda: string }[] = [
  { valor: "feed-4-5", label: "Feed", ajuda: "4:5" },
  { valor: "story-9-16", label: "Story", ajuda: "9:16" },
  { valor: "quadrado-1-1", label: "Quadrado", ajuda: "1:1" },
];

const ESTILOS: { valor: EstiloComunicacao; label: string }[] = [
  { valor: "ia_decide", label: "IA decide" },
  { valor: "premium", label: "Premium" },
  { valor: "moderno", label: "Moderno" },
  { valor: "clean", label: "Clean" },
  { valor: "vibrante", label: "Vibrante" },
  { valor: "minimalista", label: "Minimalista" },
];

const INTENSIDADES: { valor: IntensidadeVisual; label: string }[] = [
  { valor: "ia_decide", label: "IA decide" },
  { valor: "discreta", label: "Discreta" },
  { valor: "equilibrada", label: "Equilibrada" },
  { valor: "impactante", label: "Impactante" },
];

export default function NovaGeracaoForm({
  clienteId,
  saldoDisponivel,
  ehSocio,
}: {
  clienteId: string;
  saldoDisponivel: number;
  ehSocio: boolean;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [quantidade, setQuantidade] = useState<number>(1);
  const [formato, setFormato] = useState<Formato>("feed-4-5");
  const [estilo, setEstilo] = useState<EstiloComunicacao>("ia_decide");
  const [intensidade, setIntensidade] = useState<IntensidadeVisual>("ia_decide");
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [podeForcar, setPodeForcar] = useState(false);

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
        // Libera o microfone na hora — senão o indicador do navegador fica
        // aceso depois que o áudio já foi enviado.
        stream.getTracks().forEach((t) => t.stop());
        void enviar(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
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
    setTranscrevendo(true);
  }

  async function enviar(audio?: Blob, forcarSemSaldo = false) {
    setEnviando(true);
    setErro(null);
    try {
      let res: Response;
      if (audio) {
        const form = new FormData();
        form.append("clienteId", clienteId);
        form.append("audio", audio, "pedido.webm");
        form.append("quantidade", String(quantidade));
        form.append("formato", formato);
        form.append("estilo", estilo);
        form.append("intensidade", intensidade);
        if (forcarSemSaldo) form.append("forcarSemSaldo", "true");
        res = await fetch("/api/geracoes/criar", { method: "POST", body: form });
      } else {
        res = await fetch("/api/geracoes/criar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clienteId, prompt, quantidade, formato, estilo, intensidade, forcarSemSaldo }),
        });
      }

      const json = await lerRespostaJSON<{
        error?: string;
        pedidoId?: string;
        saldoInsuficiente?: boolean;
        podeForcar?: boolean;
      }>(res);

      if (!res.ok || !json.pedidoId) {
        if (json.saldoInsuficiente) {
          setPodeForcar(Boolean(json.podeForcar));
          setErro(json.error ?? "Saldo insuficiente.");
          return;
        }
        throw new Error(json.error ?? "Erro ao iniciar a geração.");
      }

      router.push(`/pedidos/${json.pedidoId}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao iniciar a geração.");
    } finally {
      setEnviando(false);
      setTranscrevendo(false);
    }
  }

  if (transcrevendo || (enviando && !erro)) {
    return (
      <div className="card p-6">
        <GerandoMensagem
          mensagens={[
            "Ouvindo seu pedido…",
            "Lendo o perfil do cliente…",
            "Montando a direção de arte…",
            "Enviando para a fila…",
          ]}
        />
      </div>
    );
  }

  const custoEmImagens = quantidade;
  const faltaSaldo = custoEmImagens > saldoDisponivel;

  return (
    <div className="card p-4 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">O que você precisa?</h2>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          Escreva ou fale do seu jeito. O agente lê a identidade visual, o nicho e os materiais deste
          cliente antes de criar.
        </p>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        className="input min-h-[110px] resize-none"
        placeholder="Ex: promoção de hambúrguer artesanal no combo com fritas e refri por R$39,90, hoje só até as 22h"
        disabled={gravando}
      />

      <div className="flex flex-wrap gap-2">
        {gravando ? (
          <button type="button" onClick={pararGravacao} className="btn btn-accent">
            ⏹ Parar e usar o áudio
          </button>
        ) : (
          <button type="button" onClick={iniciarGravacao} className="btn btn-outline">
            🎙 Gravar áudio
          </button>
        )}
        {gravando && <span className="text-sm text-[var(--muted)] self-center">Gravando…</span>}
      </div>

      <Grupo titulo="Quantas imagens">
        {QUANTIDADES.map((q) => (
          <Opcao key={q} ativo={quantidade === q} onClick={() => setQuantidade(q)}>
            {q}
          </Opcao>
        ))}
      </Grupo>

      <Grupo titulo="Formato">
        {FORMATOS.map((f) => (
          <Opcao key={f.valor} ativo={formato === f.valor} onClick={() => setFormato(f.valor)}>
            {f.label} <span className="opacity-60">{f.ajuda}</span>
          </Opcao>
        ))}
      </Grupo>

      <Grupo titulo="Estilo visual">
        {ESTILOS.map((e) => (
          <Opcao key={e.valor} ativo={estilo === e.valor} onClick={() => setEstilo(e.valor)}>
            {e.label}
          </Opcao>
        ))}
      </Grupo>

      <Grupo titulo="Impacto visual">
        {INTENSIDADES.map((i) => (
          <Opcao key={i.valor} ativo={intensidade === i.valor} onClick={() => setIntensidade(i.valor)}>
            {i.label}
          </Opcao>
        ))}
      </Grupo>

      <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <span>
          Consome {custoEmImagens} do pacote · saldo: {saldoDisponivel}
        </span>
      </div>

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => enviar()}
          disabled={!prompt.trim() || enviando || gravando || (faltaSaldo && !ehSocio)}
          className="btn btn-primary"
        >
          Gerar {quantidade > 1 ? `${quantidade} imagens` : "imagem"}
        </button>

        {/* Produzir sem saldo é decisão comercial: fica só com o sócio. */}
        {podeForcar && ehSocio && (
          <button type="button" onClick={() => enviar(undefined, true)} disabled={enviando} className="btn btn-outline">
            Gerar mesmo sem saldo
          </button>
        )}
      </div>

      {faltaSaldo && !ehSocio && (
        <p className="text-xs text-[var(--muted)]">
          Este cliente não tem saldo suficiente. Peça a um sócio para lançar o pacote.
        </p>
      )}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{titulo}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Opcao({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={ativo ? "chip chip-selected" : "chip"}>
      {children}
    </button>
  );
}
