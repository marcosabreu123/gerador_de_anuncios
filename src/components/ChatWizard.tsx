"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  TIPOS_IMAGEM_ANEXO,
  TIPOS_PECA,
  type BriefingCompleto,
  type ContratoAgente,
  type ImagemAnexo,
  type MensagemChat,
  type TipoImagemAnexo,
} from "@/lib/types";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

// campoEmColeta usa "foto" (pergunta em linguagem simples) mas o anexo em si
// é do tipo "produto" (ver ImagemAnexo/TIPOS_IMAGEM_ANEXO em lib/types.ts).
const CAMPO_PARA_TIPO_IMAGEM: Record<string, TipoImagemAnexo> = {
  foto: "produto",
  referencia: "referencia",
  logotipo: "logotipo",
};

// Primeira pergunta é fixa (não gasta chamada à IA) — já entra no formato do
// contrato do agente pra manter o histórico consistente (ver agente-conversa.ts).
function contratoInicial(): ContratoAgente {
  return {
    mensagem:
      "Oi! Vou te ajudar a montar sua arte. Pra começar: que tipo de peça você quer criar hoje?",
    opcoes: (Object.keys(TIPOS_PECA) as (keyof typeof TIPOS_PECA)[]).map((t) => TIPOS_PECA[t].label),
    campoEmColeta: "tipoPeca",
    briefingParcial: {},
    prontoParaGerar: false,
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

function mensagemPular(campo: string): string {
  if (campo === "foto") return "Não tenho foto agora, pode gerar do zero.";
  if (campo === "referencia") return "Não tenho imagem de referência, pode pular.";
  return "Não tenho logotipo, pode pular.";
}

export default function ChatWizard() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  const [mensagens, setMensagens] = useState<MensagemChat[]>(() => [
    { role: "assistant", content: JSON.stringify(contratoInicial()) },
  ]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviandoTipo, setEnviandoTipo] = useState<TipoImagemAnexo | null>(null);
  const [imagens, setImagens] = useState<ImagemAnexo[]>([]);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ultimaAssistente = [...mensagens].reverse().find((m) => m.role === "assistant");
  const contrato = ultimaAssistente ? parseContrato(ultimaAssistente.content) : null;
  const tipoImagemAtual = contrato?.campoEmColeta
    ? CAMPO_PARA_TIPO_IMAGEM[contrato.campoEmColeta]
    : undefined;

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
      const json = (await res.json()) as ContratoAgente | { error: string };
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
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function gerar() {
    if (!contrato?.prontoParaGerar) return;
    setGerando(true);
    setErro(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagens,
          briefing: contrato.briefingParcial as BriefingCompleto,
          mensagens,
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

  const aguardandoImagem = !!tipoImagemAtual;
  const temOpcoes = !!contrato?.opcoes?.length && !aguardandoImagem;

  return (
    <div className="flex flex-col flex-1 min-h-0">
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

        {imagens.length > 0 && (
          <div className="self-end flex gap-2 flex-wrap justify-end">
            {imagens.map((img, i) => (
              <div
                key={i}
                className="w-16 h-16 rounded-lg overflow-hidden border border-[var(--border)] relative"
                title={TIPOS_IMAGEM_ANEXO[img.tipo].label}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.tipo} className="w-full h-full object-cover" />
              </div>
            ))}
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

      {/* Área de interação: upload de imagem, botões de resposta rápida, ou texto livre */}
      {aguardandoImagem && tipoImagemAtual ? (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={enviandoTipo !== null || enviando}
            className="btn btn-primary btn-block"
          >
            {enviandoTipo === tipoImagemAtual
              ? "Enviando…"
              : TIPOS_IMAGEM_ANEXO[tipoImagemAtual].botao}
          </button>
          <button
            type="button"
            onClick={() => enviarMensagem(mensagemPular(contrato!.campoEmColeta!))}
            disabled={enviandoTipo !== null || enviando}
            className="text-sm text-[var(--muted)] underline text-center"
          >
            {contrato?.campoEmColeta === "foto" ? "Não tenho foto agora" : "Não tenho / pular"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => onSelecionarImagens(tipoImagemAtual, e)}
            className="hidden"
          />
        </div>
      ) : temOpcoes ? (
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
      ) : (
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
            placeholder="Digite sua resposta…"
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
      )}
    </div>
  );
}
