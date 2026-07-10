"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { lerRespostaJSON } from "@/lib/fetch-json";
import GerandoMensagem from "@/components/GerandoMensagem";
import type { TipoUsoAnexoAjuste } from "@/lib/types";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

// Mini conversa de ajuste, reaproveitada em toda tela que tenha uma área de
// ajuste sobre uma arte já existente: pós-geração (ResultadoView), edição de
// design pronto (EditarWizard) etc. Antes desse componente, o pedido virava
// geração/pergunta em uma única tentativa — se o classificador respondesse
// com uma pergunta de esclarecimento, a interface não dava jeito do usuário
// responder, só de clicar em gerar. Aqui o pedido pode virar uma conversa de
// vários turnos até ficar claro o que muda, e só then o botão de gerar (que
// cobra crédito) aparece.

interface Mensagem {
  role: "user" | "assistant";
  content: string;
  anexoUrl?: string | null;
}

type Status = "aguardando_pedido" | "precisa_esclarecimento" | "pronto_para_confirmar";

interface ClassificacaoResposta {
  tipo: "ajuste" | "nova-criacao" | "ambiguo";
  status: "precisa_esclarecimento" | "pronto_para_confirmar";
  pergunta: string | null;
  resumo: string;
  usaAnexo: boolean;
  tipoUsoAnexo: TipoUsoAnexoAjuste;
  sugerirOverlay: boolean;
}

export interface ConfirmacaoAjuste {
  pedidoFinal: string;
  anexoUrl: string | null;
  tipoUsoAnexo: TipoUsoAnexoAjuste;
}

export default function AjusteConversa({
  onConfirmar,
  labelGerar = "Gerar ajuste (1 crédito)",
  sugestoes = [],
  placeholder = "Escreva com suas palavras o que você quer mudar…",
  linkNovaVersao = "/melhorar",
}: {
  onConfirmar: (dados: ConfirmacaoAjuste) => Promise<void>;
  labelGerar?: string;
  sugestoes?: string[];
  placeholder?: string;
  linkNovaVersao?: string;
}) {
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [historico, setHistorico] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [status, setStatus] = useState<Status>("aguardando_pedido");
  const [classificacao, setClassificacao] = useState<ClassificacaoResposta | null>(null);
  const [classificando, setClassificando] = useState(false);
  const [anexoUrl, setAnexoUrl] = useState<string | null>(null);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function onSelecionarAnexo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro(null);
    setEnviandoAnexo(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada. Faça login novamente.");

      const ext = file.name.split(".").pop() || "jpg";
      const path = `${user.id}/originais/ajuste-anexo/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setAnexoUrl(data.publicUrl);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setEnviandoAnexo(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removerAnexo() {
    setAnexoUrl(null);
  }

  async function classificar(historicoAtualizado: Mensagem[]) {
    setErro(null);
    setClassificando(true);
    try {
      const res = await fetch("/api/adjust-classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          historico: historicoAtualizado.map(({ role, content }) => ({ role, content })),
          temAnexo: !!anexoUrl,
        }),
      });
      const json = await lerRespostaJSON<ClassificacaoResposta & { error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Erro ao entender o pedido.");
      setClassificacao(json);
      setHistorico([
        ...historicoAtualizado,
        { role: "assistant", content: json.status === "pronto_para_confirmar" ? json.resumo : (json.pergunta ?? json.resumo) },
      ]);
      setStatus(json.status);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui entender o pedido agora. Tenta de novo?");
      // mantém o histórico como estava antes da tentativa, permitindo reenviar.
      setHistorico(historicoAtualizado.slice(0, -1));
    } finally {
      setClassificando(false);
    }
  }

  function enviar() {
    if (!texto.trim() || classificando) return;
    const novoHistorico: Mensagem[] = [...historico, { role: "user", content: texto.trim(), anexoUrl }];
    setTexto("");
    classificar(novoHistorico);
  }

  function forcarSoAjuste() {
    const novoHistorico: Mensagem[] = [
      ...historico,
      { role: "user", content: "Não, quero só ajustar esse ponto específico, sem criar uma versão nova." },
    ];
    classificar(novoHistorico);
  }

  function editarPedido() {
    const ultimoPedidoUsuario = [...historico].reverse().find((m) => m.role === "user");
    setTexto(ultimoPedidoUsuario?.content ?? "");
    setHistorico((prev) => prev.slice(0, -2));
    setClassificacao(null);
    setStatus(historico.length <= 2 ? "aguardando_pedido" : "precisa_esclarecimento");
  }

  async function confirmar() {
    if (!classificacao) return;
    setErro(null);
    setGerando(true);
    try {
      await onConfirmar({
        pedidoFinal: classificacao.resumo,
        anexoUrl,
        tipoUsoAnexo: classificacao.tipoUsoAnexo,
      });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar o ajuste.");
      setGerando(false);
    }
  }

  const ehNovaCriacao = classificacao?.tipo === "nova-criacao" && status === "precisa_esclarecimento";

  return (
    <div className="flex flex-col gap-3">
      {historico.length > 0 && (
        <div className="flex flex-col gap-2">
          {historico.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "self-end max-w-[90%] bg-[var(--primary)] text-[var(--primary-foreground)] rounded-2xl rounded-br-sm px-4 py-2 text-sm"
                  : "self-start max-w-[90%] card px-4 py-2 text-sm"
              }
            >
              {m.content}
              {m.anexoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.anexoUrl} alt="Anexo" className="mt-2 w-16 h-16 object-cover rounded-lg" />
              )}
            </div>
          ))}
        </div>
      )}

      {classificando && (
        <p className="text-xs text-[var(--muted)] flex items-center gap-2">
          <span className="spinner" aria-hidden="true" />
          Entendendo o pedido…
        </p>
      )}
      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

      {ehNovaCriacao ? (
        <div className="flex gap-2">
          <a href={linkNovaVersao} className="btn btn-outline flex-1 text-center">
            Criar versão nova
          </a>
          <button type="button" onClick={forcarSoAjuste} disabled={classificando} className="btn btn-accent flex-1">
            Só ajustar isso
          </button>
        </div>
      ) : status === "pronto_para_confirmar" ? (
        <div className="flex flex-col gap-3">
          <span className="badge self-start text-[var(--success)] border-[var(--success-soft)] bg-[var(--success-soft)]">
            ✓ Pronto para gerar
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={editarPedido} disabled={gerando} className="btn btn-outline flex-1">
              Editar pedido
            </button>
            <button type="button" onClick={confirmar} disabled={gerando} className="btn btn-accent flex-1">
              {gerando ? <GerandoMensagem mensagens={["Aplicando ajuste…", "Refinando composição…"]} /> : labelGerar}
            </button>
          </div>
        </div>
      ) : (
        <>
          {status === "aguardando_pedido" && sugestoes.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sugestoes.map((s) => (
                <button key={s} type="button" onClick={() => setTexto(s)} className="chip text-xs py-1.5 px-3">
                  {s}
                </button>
              ))}
            </div>
          )}

          {anexoUrl && (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={anexoUrl} alt="Imagem anexada" className="w-12 h-12 object-cover rounded-lg" />
              <span className="text-xs text-[var(--muted)] flex-1">Imagem anexada</span>
              <button type="button" onClick={removerAnexo} className="text-xs text-[var(--danger)] underline">
                Remover
              </button>
            </div>
          )}

          <textarea
            className="input min-h-[80px] resize-none"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder}
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={enviandoAnexo}
              className="btn btn-outline"
            >
              {enviandoAnexo ? "Enviando…" : anexoUrl ? "🖼️ Trocar imagem" : "🖼️ Anexar imagem"}
            </button>
            <button
              type="button"
              onClick={enviar}
              disabled={!texto.trim() || classificando}
              className="btn btn-accent flex-1"
            >
              {classificando ? "Entendendo…" : status === "precisa_esclarecimento" ? "Responder" : "Enviar"}
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={onSelecionarAnexo} className="hidden" />
        </>
      )}
    </div>
  );
}
