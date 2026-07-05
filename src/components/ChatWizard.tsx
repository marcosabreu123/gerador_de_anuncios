"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lerRespostaJSON } from "@/lib/fetch-json";
import {
  TIPOS_IMAGEM_ANEXO,
  type BriefingCompleto,
  type ContratoAgente,
  type ImagemAnexo,
  type MensagemChat,
  type TipoImagemAnexo,
} from "@/lib/types";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";
const TIPOS_ANEXO: TipoImagemAnexo[] = ["produto", "referencia", "logotipo"];

// Primeira pergunta é fixa (não gasta chamada à IA) — já entra no formato do
// contrato do agente pra manter o histórico consistente (ver agente-conversa.ts).
// A conversa começa entendendo o produto (aberto), não escolhendo categoria.
function contratoInicial(): ContratoAgente {
  return {
    mensagem: "Oi! Vou te ajudar a montar sua arte. Pra começar: o que você quer anunciar hoje?",
    opcoes: [],
    campoEmColeta: "descricaoProduto",
    briefingParcial: {},
    prontoParaGerar: false,
    acaoSugerida: "continuar_conversa",
  };
}

function parseContrato(content: string): ContratoAgente | null {
  try {
    return JSON.parse(content) as ContratoAgente;
  } catch {
    return null;
  }
}

function mensagemEnvio(tipo: TipoImagemAnexo, n: number): string {
  switch (tipo) {
    case "produto":
      return n > 1 ? `Enviei ${n} fotos do produto.` : "Enviei a foto do produto.";
    case "referencia":
      return n > 1 ? `Enviei ${n} imagens de referência.` : "Enviei uma imagem de referência.";
    case "logotipo":
      return "Enviei o logotipo.";
  }
}

export default function ChatWizard() {
  const router = useRouter();
  const supabase = createClient();
  const fileRefs = useRef<Record<TipoImagemAnexo, HTMLInputElement | null>>({
    produto: null,
    referencia: null,
    logotipo: null,
  });
  const fimRef = useRef<HTMLDivElement>(null);

  const [mensagens, setMensagens] = useState<MensagemChat[]>(() => [
    { role: "assistant", content: JSON.stringify(contratoInicial()) },
  ]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviandoTipo, setEnviandoTipo] = useState<TipoImagemAnexo | null>(null);
  const [imagens, setImagens] = useState<ImagemAnexo[]>([]);
  const [painelAberto, setPainelAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ultimaAssistente = [...mensagens].reverse().find((m) => m.role === "assistant");
  const contrato = ultimaAssistente ? parseContrato(ultimaAssistente.content) : null;
  const temOpcoes = !!contrato?.opcoes?.length;

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, gerando]);

  async function enviarMensagem(conteudo: string) {
    if (!conteudo.trim() || enviando || gerando) return;
    setErro(null);
    const novas: MensagemChat[] = [...mensagens, { role: "user", content: conteudo.trim() }];
    setMensagens(novas);
    setTexto("");
    setEnviando(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagens: novas }),
      });
      const json = await lerRespostaJSON<ContratoAgente | { error: string }>(res);
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Erro na conversa.");
      }
      setMensagens([...novas, { role: "assistant", content: JSON.stringify(json) }]);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui responder agora. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  async function onSelecionarImagens(tipo: TipoImagemAnexo, e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setErro(null);
    setEnviandoTipo(tipo);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Faça login novamente.");

      const novas: ImagemAnexo[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/originais/${tipo}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        novas.push({ tipo, url: data.publicUrl });
      }
      setImagens((prev) => [...prev, ...novas]);
      await enviarMensagem(mensagemEnvio(tipo, novas.length));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setEnviandoTipo(null);
      const ref = fileRefs.current[tipo];
      if (ref) ref.value = "";
    }
  }

  function removerImagem(index: number) {
    setImagens((prev) => prev.filter((_, i) => i !== index));
  }

  async function gerar() {
    if (!contrato?.prontoParaGerar) return;
    setGerando(true);
    setErro(null);
    try {
      // A verdade sobre quais anexos existem vem do que foi de fato enviado
      // (painel lateral), não do que a conversa acha que existe — mais
      // confiável do que depender do modelo acertar esses três booleanos.
      const briefing: BriefingCompleto = {
        ...(contrato.briefingParcial as BriefingCompleto),
        temFotoProduto: imagens.some((i) => i.tipo === "produto"),
        temReferencia: imagens.some((i) => i.tipo === "referencia"),
        temLogotipo: imagens.some((i) => i.tipo === "logotipo"),
      };
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagens, briefing, mensagens }),
      });
      const json = await lerRespostaJSON<{ error?: string; projectId?: string }>(res);
      if (!res.ok || !json.projectId) throw new Error(json.error ?? "Erro ao gerar.");
      router.push(`/resultado/${json.projectId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar a arte.");
      setGerando(false);
    }
  }

  const totalAnexos = imagens.length;

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Cabeçalho leve com acesso ao painel de anexos — sempre disponível,
          nada aqui é obrigatório para gerar. */}
      <div className="flex items-center justify-end mb-2">
        <button
          type="button"
          onClick={() => setPainelAberto(true)}
          className="flex items-center gap-1.5 text-xs font-semibold bg-[var(--accent-soft)] px-3 py-1.5 rounded-full"
        >
          📎 Anexos {totalAnexos > 0 ? `(${totalAnexos})` : "(opcional)"}
        </button>
      </div>

      {/* Transcrição */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
        {mensagens.map((m, i) => {
          if (m.role === "user") {
            return (
              <div key={i} className="self-end max-w-[85%] bg-[var(--primary)] text-[var(--primary-foreground)] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm">
                {m.content}
              </div>
            );
          }
          const c = parseContrato(m.content);
          return (
            <div key={i} className="self-start max-w-[85%] card px-4 py-2.5 text-sm">
              {c?.mensagem ?? "…"}
            </div>
          );
        })}

        {enviando && (
          <div className="self-start card px-4 py-2.5 text-sm text-[var(--muted)]">
            digitando…
          </div>
        )}

        <div ref={fimRef} />
      </div>

      {erro && <p className="text-sm text-[var(--danger)] mb-3">{erro}</p>}

      {/* Botão de gerar — aparece assim que o briefing estiver resolvido,
          mas a conversa continua liberada pra refinar depois. */}
      {contrato?.prontoParaGerar && (
        <button
          type="button"
          onClick={gerar}
          disabled={gerando}
          className="btn btn-accent btn-block mb-3"
        >
          {gerando ? "Gerando artes…" : "Gerar minhas artes ✨"}
        </button>
      )}

      {/* Área de interação: botões de resposta rápida e/ou texto livre.
          Anexar imagem nunca bloqueia essa área — fica no painel lateral. */}
      <div className="flex flex-col gap-2">
        {temOpcoes && (
          <div className="flex flex-wrap gap-2">
            {contrato!.opcoes.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => enviarMensagem(o)}
                disabled={enviando || gerando}
                className="text-sm font-medium bg-[var(--accent-soft)] px-4 py-2.5 rounded-full disabled:opacity-50"
              >
                {o}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviarMensagem(texto);
          }}
          className="flex gap-2"
        >
          <input
            className="input flex-1"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={temOpcoes ? "Ou descreva com suas palavras…" : "Digite sua resposta…"}
            disabled={enviando || gerando}
          />
          <button
            type="submit"
            disabled={!texto.trim() || enviando || gerando}
            className="btn btn-primary"
          >
            Enviar
          </button>
        </form>
      </div>

      {/* Painel lateral de anexos — foto do produto, referência e logotipo.
          Nenhum é obrigatório para gerar a arte. */}
      {painelAberto && (
        <div className="fixed inset-0 z-20 flex justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setPainelAberto(false)}
          />
          <div className="relative w-[85%] max-w-sm h-full bg-[var(--background)] shadow-xl flex flex-col p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Anexos (opcional)</h2>
              <button
                type="button"
                onClick={() => setPainelAberto(false)}
                className="text-sm text-[var(--muted)]"
              >
                Fechar
              </button>
            </div>
            <p className="text-xs text-[var(--muted)] mb-4">
              Nenhum anexo é obrigatório. Fotos reais do produto ajudam a fidelidade da arte, mas
              você pode gerar sem nenhum deles.
            </p>

            <div className="flex flex-col gap-5">
              {TIPOS_ANEXO.map((tipo) => {
                const info = TIPOS_IMAGEM_ANEXO[tipo];
                const anexosDoTipo = imagens
                  .map((img, index) => ({ img, index }))
                  .filter(({ img }) => img.tipo === tipo);
                return (
                  <div key={tipo} className="card p-3">
                    <p className="font-semibold text-sm">{info.label}</p>
                    <p className="text-xs text-[var(--muted)] mt-0.5 mb-2">{info.ajuda}</p>

                    {anexosDoTipo.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {anexosDoTipo.map(({ img, index }) => (
                          <div
                            key={index}
                            className="w-14 h-14 rounded-lg overflow-hidden border border-[var(--border)] relative"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.url} alt={tipo} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => removerImagem(index)}
                              className="absolute top-0 right-0 bg-black/60 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-bl"
                              aria-label="Remover"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => fileRefs.current[tipo]?.click()}
                      disabled={enviandoTipo !== null}
                      className="btn btn-outline btn-block text-sm py-2 disabled:opacity-50"
                    >
                      {enviandoTipo === tipo ? "Enviando…" : info.botao}
                    </button>
                    <input
                      ref={(el) => {
                        fileRefs.current[tipo] = el;
                      }}
                      type="file"
                      accept="image/*"
                      multiple={tipo !== "logotipo"}
                      onChange={(e) => onSelecionarImagens(tipo, e)}
                      className="hidden"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
