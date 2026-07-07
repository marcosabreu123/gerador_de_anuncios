"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lerRespostaJSON } from "@/lib/fetch-json";
import type { DirecaoTransformacao, ModoTransformacao } from "@/lib/types";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

// Fluxo rápido: o lojista já tem uma arte pronta (feita aqui ou fora do
// app) e só quer uma versão melhorada OU uma versão nova dela — sem passar
// pelo briefing completo do fluxo de criação. Editar um detalhe específico
// (preço, texto, logo, fundo...) já tem seu próprio fluxo na Home — não
// duplicamos essa opção aqui.
type Fase = "upload" | "modo" | "direcao" | "instrucao" | "confirmando";

interface OpcaoDirecao {
  label: string;
  valor: DirecaoTransformacao;
}

const DIRECOES_MELHORAR: OpcaoDirecao[] = [
  { label: "Mais profissional", valor: "profissional" },
  { label: "Mais clean", valor: "clean" },
  { label: "Mais premium", valor: "premium" },
  { label: "Melhorar legibilidade", valor: "legibilidade" },
  { label: "Reduzir poluição visual", valor: "reduzir_poluicao" },
  { label: "Deixar a IA decidir", valor: "ia_decide" },
];

const DIRECOES_NOVA_VERSAO: OpcaoDirecao[] = [
  { label: "Mais premium", valor: "premium" },
  { label: "Mais clean", valor: "clean" },
  { label: "Mais chamativa", valor: "chamativa" },
  { label: "Mais moderna", valor: "moderna" },
  { label: "Mais divertida", valor: "divertida" },
  { label: "Deixar a IA decidir", valor: "ia_decide" },
  { label: "Personalizado", valor: "personalizado" },
];

// Aviso leve quando o pedido escrito parece na verdade um ajuste pontual —
// esse fluxo cria uma peça nova/melhorada, não edita um elemento só (isso
// já existe no fluxo de "Editar um detalhe de uma arte").
const PALAVRAS_AJUSTE_PONTUAL =
  /\b(s[oó]\s+(troca|muda|altera|remove|tira|ajusta|diminui|aumenta|coloca|adiciona)|diminui(r)?\s+a\s+logo|aumenta(r)?\s+a\s+logo|remove(r)?\s+(esse|este|o|a)\s+(texto|selo|elemento)|troca(r)?\s+(o|a)\s+(pre[cç]o|texto|cor|telefone|endere[cç]o|whatsapp))\b/i;

function resumoConfirmacao(modo: ModoTransformacao, direcao: DirecaoTransformacao | null, instrucao: string): string {
  if (direcao === "personalizado") {
    return `Vou criar uma nova versão baseada nessa arte aplicando: "${instrucao.trim()}". Mantendo produto, marca, preços e informações comerciais. Posso gerar?`;
  }
  const rotulo =
    DIRECOES_MELHORAR.find((d) => d.valor === direcao)?.label.toLowerCase() ??
    DIRECOES_NOVA_VERSAO.find((d) => d.valor === direcao)?.label.toLowerCase();
  if (modo === "melhoria_conservadora") {
    return rotulo && direcao !== "ia_decide"
      ? `Vou melhorar essa arte deixando-a ${rotulo}, mantendo a mesma estrutura, produto, marca, textos e informações comerciais. Posso gerar?`
      : "Vou melhorar essa arte mantendo a mesma estrutura, produto, marca, textos e informações comerciais, mas com acabamento mais profissional. Posso gerar?";
  }
  return rotulo && direcao !== "ia_decide"
    ? `Vou criar uma nova versão ${rotulo} dessa arte — mesmas informações, mas um design diferente. Posso gerar?`
    : "Vou criar uma nova versão dessa arte com um design diferente, mantendo as mesmas informações. Posso gerar?";
}

export default function MelhorarArteWizard() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fase, setFase] = useState<Fase>("upload");
  const [preview, setPreview] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [modo, setModo] = useState<ModoTransformacao | null>(null);
  const [direcao, setDirecao] = useState<DirecaoTransformacao | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function onSelecionarArte(e: React.ChangeEvent<HTMLInputElement>) {
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
      const path = `${user.id}/originais/melhorar/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;

      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      setOriginalUrl(data.publicUrl);
      setFase("modo");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar a arte.");
      setPreview(null);
    } finally {
      setEnviandoFoto(false);
    }
  }

  function escolherModo(escolhido: ModoTransformacao) {
    setModo(escolhido);
    setDirecao(null);
    setInstrucao("");
    setErro(null);
    setFase("direcao");
  }

  function escolherDirecao(opcao: OpcaoDirecao) {
    setDirecao(opcao.valor);
    if (opcao.valor === "personalizado") {
      setFase("instrucao");
    } else {
      setFase("confirmando");
    }
  }

  function confirmarInstrucao() {
    if (!instrucao.trim()) return;
    setFase("confirmando");
  }

  async function gerar() {
    if (!originalUrl || !modo) return;
    setGerando(true);
    setErro(null);
    try {
      const res = await fetch("/api/melhorar-arte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagemOriginal: originalUrl,
          modoTransformacao: modo,
          direcao: direcao ?? undefined,
          instrucaoUsuario: direcao === "personalizado" ? instrucao.trim() : undefined,
        }),
      });
      const json = await lerRespostaJSON<{ error?: string; projectId?: string }>(res);
      if (!res.ok || !json.projectId) throw new Error(json.error ?? "Erro ao gerar a nova versão.");
      router.push(`/resultado/${json.projectId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar a nova versão.");
      setGerando(false);
    }
  }

  const pareceAjustePontual = direcao === "personalizado" && PALAVRAS_AJUSTE_PONTUAL.test(instrucao);

  return (
    <div className="flex flex-col flex-1 gap-5">
      <div>
        <h2 className="text-lg font-bold">Melhorar ou recriar uma arte</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Envie uma arte pronta para melhorar o visual ou criar uma nova versão com as mesmas
          informações — sem passar pelo fluxo completo de criação.
        </p>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={gerando}
        className="card w-full aspect-square flex flex-col items-center justify-center gap-2 border-dashed overflow-hidden"
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Arte enviada" className="w-full h-full object-contain" />
        ) : (
          <>
            <span className="text-4xl">🖼️</span>
            <span className="text-sm text-[var(--muted)]">Toque para enviar a arte</span>
          </>
        )}
      </button>
      {enviandoFoto && <p className="text-sm text-[var(--muted)]">Enviando…</p>}
      {originalUrl && !enviandoFoto && <p className="text-sm text-green-700">Arte enviada ✓</p>}
      <input ref={fileRef} type="file" accept="image/*" onChange={onSelecionarArte} className="hidden" />

      {fase === "modo" && (
        <div className="card p-4 flex flex-col gap-3">
          <h3 className="font-semibold text-sm">O que você quer fazer com essa arte?</h3>

          <button
            type="button"
            onClick={() => escolherModo("melhoria_conservadora")}
            className="text-left bg-[var(--accent-soft)] px-4 py-3 rounded-xl"
          >
            <p className="font-semibold text-sm">Melhorar esta arte</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Deixar mais profissional mantendo a mesma ideia e estrutura.
            </p>
          </button>

          <button
            type="button"
            onClick={() => escolherModo("nova_versao_criativa")}
            className="text-left bg-[var(--accent-soft)] px-4 py-3 rounded-xl"
          >
            <p className="font-semibold text-sm">Criar uma nova versão</p>
            <p className="text-xs text-[var(--muted)] mt-0.5">
              Usar as mesmas informações, mas criar um novo design.
            </p>
          </button>
        </div>
      )}

      {fase === "direcao" && modo && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm">
            {modo === "melhoria_conservadora" ? "Quer melhorar em qual direção?" : "Qual direção você quer para essa nova versão?"}
          </h3>
          <div className="flex flex-col gap-2 mt-3">
            {(modo === "melhoria_conservadora" ? DIRECOES_MELHORAR : DIRECOES_NOVA_VERSAO).map((opcao) => (
              <button
                key={opcao.valor}
                type="button"
                onClick={() => escolherDirecao(opcao)}
                className="text-sm font-medium bg-[var(--accent-soft)] px-4 py-2.5 rounded-full text-left"
              >
                {opcao.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setFase("modo")} className="text-xs text-[var(--muted)] underline mt-3">
            Voltar
          </button>
        </div>
      )}

      {fase === "instrucao" && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm">Descreva a nova direção que você imagina</h3>
          <textarea
            className="input min-h-[80px] resize-none mt-3"
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            placeholder="Ex: um visual mais colorido e divertido, com fundo ilustrado"
          />
          {pareceAjustePontual && (
            <p className="text-xs text-[var(--muted)] mt-2">
              💡 Isso parece um ajuste pontual (mudar só um ponto específico). O{" "}
              <a href="/editar" className="underline">
                fluxo de editar um detalhe da arte
              </a>{" "}
              costuma ficar mais preciso pra isso. Mas se quiser mesmo uma versão nova, pode continuar.
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setFase("direcao")} className="btn btn-outline flex-1">
              Voltar
            </button>
            <button
              type="button"
              onClick={confirmarInstrucao}
              disabled={!instrucao.trim()}
              className="btn btn-accent flex-1"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {fase === "confirmando" && modo && (
        <div className="card p-4">
          <p className="text-sm">{resumoConfirmacao(modo, direcao, instrucao)}</p>
          {erro && <p className="text-sm text-[var(--danger)] mt-2">{erro}</p>}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setFase(direcao === "personalizado" ? "instrucao" : "direcao")}
              disabled={gerando}
              className="btn btn-outline flex-1"
            >
              Cancelar
            </button>
            <button type="button" onClick={gerar} disabled={gerando} className="btn btn-accent flex-1">
              {gerando ? "Gerando…" : "Gerar nova versão (1 crédito)"}
            </button>
          </div>
        </div>
      )}

      {erro && fase !== "confirmando" && <p className="text-sm text-[var(--danger)]">{erro}</p>}
    </div>
  );
}
