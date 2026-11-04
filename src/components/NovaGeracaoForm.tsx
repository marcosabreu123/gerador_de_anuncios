"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lerRespostaJSON } from "@/lib/fetch-json";
import GerandoMensagem from "@/components/GerandoMensagem";
import { enviarImagemParaStorage } from "@/lib/upload-storage";
import type { Referencia } from "@/lib/agencia/types";
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
  fotosProduto,
}: {
  clienteId: string;
  saldoDisponivel: number;
  ehSocio: boolean;
  fotosProduto: Referencia[];
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
  // Arte pronta que o operador quer melhorar/recriar. Quando preenchida, a
  // geração trabalha sobre ela em vez de criar do zero.
  const [arteBaseUrl, setArteBaseUrl] = useState<string | null>(null);
  const [modoTransformacao, setModoTransformacao] = useState<
    "melhoria_recompositiva" | "nova_versao_criativa"
  >("melhoria_recompositiva");
  const [subindoArte, setSubindoArte] = useState(false);
  // Com uma foto só ela já vem marcada. Com várias, a escolha é do operador: o
  // modelo trata o anexo como o produto da peça, e a foto errada estraga a arte.
  const [produtoRefId, setProdutoRefId] = useState<string | null>(
    fotosProduto.length === 1 ? fotosProduto[0].id : null,
  );

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  // O fim da gravação acontece fora do render em que ela começou. Sem a versão
  // mais recente do envio, um formato trocado durante a gravação se perderia.
  const enviarRef = useRef<typeof enviar>(null);
  useEffect(() => {
    enviarRef.current = enviar;
  });

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
        void enviarRef.current?.(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
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
        if (produtoRefId) form.append("produtoRefId", produtoRefId);
        if (arteBaseUrl) {
          form.append("arteBaseUrl", arteBaseUrl);
          form.append("modoTransformacao", modoTransformacao);
        }
        res = await fetch("/api/geracoes/criar", { method: "POST", body: form });
      } else {
        res = await fetch("/api/geracoes/criar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clienteId,
            prompt,
            quantidade,
            formato,
            estilo,
            intensidade,
            forcarSemSaldo,
            ...(produtoRefId ? { produtoRefId } : {}),
            ...(arteBaseUrl ? { arteBaseUrl, modoTransformacao } : {}),
          }),
        });
      }

      const json = await lerRespostaJSON<{
        error?: string;
        pedidoId?: string;
        saldoInsuficiente?: boolean;
        podeForcar?: boolean;
        transcricao?: string;
      }>(res);

      if (!res.ok || !json.pedidoId) {
        if (json.saldoInsuficiente) {
          if (json.transcricao) setPrompt(json.transcricao);
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
  const bloqueadoSemSaldo = faltaSaldo && !ehSocio;

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
          <button type="button" onClick={iniciarGravacao} disabled={bloqueadoSemSaldo} className="btn btn-outline">
            🎙 Gravar áudio
          </button>
        )}
        {gravando && <span className="text-sm text-[var(--muted)] self-center">Gravando…</span>}
      </div>

      {/* Partir de uma arte pronta. Opcional e recolhido no visual, porque a
          maioria das gerações é do zero — mas quando o cliente manda a peça
          antiga e pede "melhora essa aí", é por aqui. */}
      <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        <span className="label">Partir de uma arte pronta (opcional)</span>

        {arteBaseUrl ? (
          <div className="flex items-start gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={arteBaseUrl} alt="Arte base" className="w-20 rounded-lg" />
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex flex-wrap gap-2">
                <Opcao
                  ativo={modoTransformacao === "melhoria_recompositiva"}
                  onClick={() => setModoTransformacao("melhoria_recompositiva")}
                >
                  Melhorar esta arte
                </Opcao>
                <Opcao
                  ativo={modoTransformacao === "nova_versao_criativa"}
                  onClick={() => setModoTransformacao("nova_versao_criativa")}
                >
                  Criar nova versão
                </Opcao>
              </div>
              <p className="text-xs text-[var(--muted)]">
                {modoTransformacao === "melhoria_recompositiva"
                  ? "Mesma campanha, composição visivelmente melhor."
                  : "Mesmas informações, design recriado do zero."}
              </p>
              <button
                type="button"
                onClick={() => setArteBaseUrl(null)}
                className="text-xs text-[var(--muted)] underline self-start"
              >
                Remover arte base
              </button>
            </div>
          </div>
        ) : (
          <>
            <input
              type="file"
              accept="image/*"
              id="arte-base"
              className="hidden"
              disabled={subindoArte}
              onChange={async (e) => {
                const arquivo = e.target.files?.[0];
                if (!arquivo) return;
                setSubindoArte(true);
                setErro(null);
                try {
                  setArteBaseUrl(await enviarImagemParaStorage(arquivo, `artes-base/${clienteId}`));
                } catch (err) {
                  setErro(err instanceof Error ? err.message : "Falha ao enviar a arte.");
                } finally {
                  setSubindoArte(false);
                  e.target.value = "";
                }
              }}
            />
            <label
              htmlFor="arte-base"
              className={`btn btn-outline self-start text-sm ${subindoArte ? "opacity-60 pointer-events-none" : ""}`}
            >
              {subindoArte ? "Enviando…" : "Enviar arte existente"}
            </label>
          </>
        )}
      </div>

      {fotosProduto.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="label">Foto do produto</span>
          <div className="flex flex-wrap items-center gap-2">
            <Opcao ativo={produtoRefId === null} onClick={() => setProdutoRefId(null)}>
              Nenhuma
            </Opcao>
            {fotosProduto.map((foto) => (
              <button
                key={foto.id}
                type="button"
                onClick={() => setProdutoRefId(foto.id)}
                title={foto.descricao ?? "Foto do produto"}
                aria-pressed={produtoRefId === foto.id}
                className={`rounded-lg overflow-hidden border-2 ${
                  produtoRefId === foto.id ? "border-[var(--accent)]" : "border-transparent"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={foto.url} alt={foto.descricao ?? "Foto do produto"} className="w-14 h-14 object-cover" />
              </button>
            ))}
          </div>
          <p className="text-xs text-[var(--muted)]">
            A foto escolhida vira o produto da arte. Sem foto, a IA compõe o produto do pedido.
          </p>
        </div>
      )}

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
          disabled={(!prompt.trim() && !arteBaseUrl) || enviando || gravando || bloqueadoSemSaldo}
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

      {bloqueadoSemSaldo && (
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
