"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Mic, Minus, Sparkles, Square } from "lucide-react";
import { lerRespostaJSON } from "@/lib/fetch-json";
import GerandoMensagem from "@/components/GerandoMensagem";
import { TituloCard } from "@/components/ui";
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

const FORMATOS: { valor: Formato; label: string; ajuda: string; proporcao: string }[] = [
  { valor: "feed-4-5", label: "Feed", ajuda: "4:5", proporcao: "4 / 5" },
  { valor: "story-9-16", label: "Story", ajuda: "9:16", proporcao: "9 / 16" },
  { valor: "quadrado-1-1", label: "Quadrado", ajuda: "1:1", proporcao: "1 / 1" },
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
  materiais,
}: {
  clienteId: string;
  saldoDisponivel: number;
  ehSocio: boolean;
  fotosProduto: Referencia[];
  materiais: { tipo: string; label: string; tem: boolean }[];
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
      <div className="card flex items-center justify-center px-6 py-24 text-sm">
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
  const semIdentidade = materiais.some((m) => m.tipo === "identidade" && !m.tem);
  const proporcao = FORMATOS.find((f) => f.valor === formato)?.proporcao;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <section className="card p-5 flex flex-col gap-3">
          <TituloCard
            titulo="O que você precisa?"
            descricao="Escreva ou fale do seu jeito. O agente lê a identidade visual, o nicho e os materiais deste cliente antes de criar."
          />

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="input min-h-[132px] resize-y"
            placeholder="Ex: promoção de hambúrguer artesanal no combo com fritas e refri por R$39,90, hoje só até as 22h"
            disabled={gravando}
          />

          <div className="flex flex-wrap items-center gap-2">
            {gravando ? (
              <button type="button" onClick={pararGravacao} className="btn btn-accent">
                <Square size={14} aria-hidden="true" />
                Parar e usar o áudio
              </button>
            ) : (
              <button type="button" onClick={iniciarGravacao} disabled={bloqueadoSemSaldo} className="btn btn-outline">
                <Mic size={16} aria-hidden="true" />
                Gravar áudio
              </button>
            )}
            {gravando && <span className="text-sm text-[var(--muted)]">Gravando…</span>}
          </div>
        </section>

        <div className={`grid grid-cols-1 gap-4 ${fotosProduto.length > 0 ? "lg:grid-cols-2" : ""}`}>
          {/* Partir de uma arte pronta. Opcional e recolhido no visual, porque a
              maioria das gerações é do zero — mas quando o cliente manda a peça
              antiga e pede "melhora essa aí", é por aqui. */}
          <section className="card p-5 flex flex-col gap-3 min-w-0">
            <TituloCard titulo="Partir de uma arte pronta" descricao="Opcional. Para quando o cliente manda a peça antiga." />

            {arteBaseUrl ? (
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={arteBaseUrl} alt="Arte base" className="w-20 rounded-lg shrink-0" />
                <div className="flex flex-col gap-2 flex-1 min-w-0">
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
                  <p className="text-[13px] text-[var(--muted)]">
                    {modoTransformacao === "melhoria_recompositiva"
                      ? "Mesma campanha, composição visivelmente melhor."
                      : "Mesmas informações, design recriado do zero."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setArteBaseUrl(null)}
                    className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] underline self-start"
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
                  className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-5 text-sm font-medium cursor-pointer hover:bg-[var(--surface-muted)] transition-colors ${
                    subindoArte ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  {subindoArte ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <ImagePlus size={16} className="text-[var(--muted)]" aria-hidden="true" />
                  )}
                  {subindoArte ? "Enviando…" : "Enviar arte existente"}
                </label>
              </>
            )}
          </section>

          {fotosProduto.length > 0 && (
            <section className="card p-5 flex flex-col gap-3 min-w-0">
              <TituloCard
                titulo="Foto do produto"
                descricao={`A foto escolhida vira o produto da arte. ${
                  arteBaseUrl ? "Sem foto, vale o produto da arte enviada." : "Sem foto, a IA compõe o produto do pedido."
                }`}
              />
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
                    className={`rounded-[10px] overflow-hidden border-2 ${
                      produtoRefId === foto.id ? "border-[var(--foreground)]" : "border-transparent"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foto.url} alt={foto.descricao ?? "Foto do produto"} className="w-14 h-14 object-cover" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <section className="card p-5 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
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
        </section>
      </div>

      {/* Coluna fixa: o botão de gerar e o que ele vai gastar ficam sempre à vista,
          por mais que o operador role o formulário. */}
      <aside className="card p-5 flex flex-col gap-5 xl:sticky xl:top-6">
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

        {/* Prévia do que vai sair: quantas peças e em que proporção. */}
        <div className="quadro flex items-center justify-center gap-2 h-32 px-3" aria-hidden="true">
          {Array.from({ length: quantidade }, (_, i) => (
            <span
              key={i}
              className="h-20 rounded-md border border-[var(--border-strong)] bg-[var(--surface)]"
              style={{ aspectRatio: proporcao }}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
          <span className="label mb-0.5">O agente vai usar</span>
          <ul className="flex flex-col gap-1.5">
            {materiais.map((m) => (
              <li
                key={m.tipo}
                className={`flex items-center gap-2 text-[13px] ${m.tem ? "" : "text-[var(--muted)]"}`}
                title={m.tem ? "Disponível" : "Não cadastrado"}
              >
                {m.tem ? (
                  <Check size={14} className="text-[var(--success)] shrink-0" aria-hidden="true" />
                ) : (
                  <Minus size={14} className="shrink-0" aria-hidden="true" />
                )}
                {m.label}
              </li>
            ))}
          </ul>
          {semIdentidade && (
            <p className="text-xs text-[var(--muted)] mt-1">
              Sem identidade cadastrada as artes saem genéricas.{" "}
              <Link href={`/clientes/${clienteId}#identidade`} className="underline">
                Preencher
              </Link>{" "}
              leva um minuto e muda bastante o resultado.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-[var(--border)] pt-4">
          <p className="flex items-center justify-between gap-2 text-[13px] text-[var(--muted)]">
            <span>Consome {custoEmImagens} do pacote</span>
            <span className={faltaSaldo ? "text-[var(--danger)] font-medium" : ""}>Saldo: {saldoDisponivel}</span>
          </p>

          {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

          <button
            type="button"
            onClick={() => enviar()}
            disabled={(!prompt.trim() && !arteBaseUrl) || enviando || gravando || bloqueadoSemSaldo}
            className="btn btn-ia btn-block"
          >
            <Sparkles size={16} aria-hidden="true" />
            Gerar {quantidade > 1 ? `${quantidade} imagens` : "imagem"}
          </button>

          {/* Produzir sem saldo é decisão comercial: fica só com o sócio. */}
          {podeForcar && ehSocio && (
            <button type="button" onClick={() => enviar(undefined, true)} disabled={enviando} className="btn btn-outline btn-block">
              Gerar mesmo sem saldo
            </button>
          )}

          {bloqueadoSemSaldo && (
            <p className="text-xs text-[var(--muted)]">
              Este cliente não tem saldo suficiente. Peça a um sócio para lançar o pacote.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label mb-0">{titulo}</span>
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
    <button type="button" onClick={onClick} aria-pressed={ativo} className={ativo ? "chip chip-selected" : "chip"}>
      {children}
    </button>
  );
}
