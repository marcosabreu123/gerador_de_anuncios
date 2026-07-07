"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lerRespostaJSON } from "@/lib/fetch-json";
import type { EstiloDesejadoArteExistente, IntencaoArteExistente } from "@/lib/types";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

// Fluxo rápido: o lojista já tem uma arte pronta (feita aqui ou fora do
// app) e só quer uma versão nova/melhorada dela — sem passar pelo
// briefing completo do fluxo de criação. Diferente do ajuste pontual
// pós-geração: aqui a IA cria uma peça nova inspirada na enviada.
type Fase = "upload" | "intencao" | "instrucao" | "confirmando" | "gerando";

interface Opcao {
  label: string;
  intencao: IntencaoArteExistente;
  estiloDesejado?: EstiloDesejadoArteExistente;
  pedeInstrucao?: boolean;
  placeholderInstrucao?: string;
}

const OPCOES: Opcao[] = [
  { label: "Melhorar mantendo a mesma ideia", intencao: "melhorar_arte", estiloDesejado: "mesma_ideia_melhorada" },
  { label: "Criar uma nova variação parecida", intencao: "nova_variacao" },
  { label: "Deixar mais premium", intencao: "melhorar_arte", estiloDesejado: "premium" },
  { label: "Deixar mais clean", intencao: "melhorar_arte", estiloDesejado: "clean" },
  { label: "Deixar mais chamativa", intencao: "melhorar_arte", estiloDesejado: "chamativa" },
  {
    label: "Trocar o estilo visual",
    intencao: "melhorar_arte",
    estiloDesejado: "personalizado",
    pedeInstrucao: true,
    placeholderInstrucao: "Que estilo você imagina para essa arte? (ex: mais luxuoso, mais colorido, minimalista...)",
  },
  {
    label: "Ajuste personalizado",
    intencao: "melhorar_arte",
    estiloDesejado: "personalizado",
    pedeInstrucao: true,
    placeholderInstrucao: "O que você quer mudar ou melhorar nessa arte?",
  },
];

// Aviso leve (não bloqueia) quando o pedido escrito parece na verdade um
// ajuste pontual — esse fluxo cria uma peça nova, não edita um elemento só.
const PALAVRAS_AJUSTE_PONTUAL =
  /\b(s[oó]\s+(troca|muda|altera|remove|tira|ajusta|diminui|aumenta|coloca|adiciona)|diminui(r)?\s+a\s+logo|aumenta(r)?\s+a\s+logo|remove(r)?\s+(esse|este|o|a)\s+(texto|selo|elemento)|troca(r)?\s+(o|a)\s+(pre[cç]o|texto|cor|telefone|endere[cç]o|whatsapp))\b/i;

function resumoConfirmacao(opcao: Opcao, instrucao: string): string {
  if (opcao.pedeInstrucao) {
    return `Vou criar uma nova versão baseada nessa arte aplicando: "${instrucao.trim()}". Mantendo produto, marca, textos principais e informações comerciais. Posso gerar?`;
  }
  switch (opcao.estiloDesejado) {
    case "premium":
      return "Vou criar uma nova versão mais premium baseada nessa arte, mantendo as informações principais. Posso gerar?";
    case "clean":
      return "Vou criar uma nova versão mais clean baseada nessa arte, mantendo as informações principais. Posso gerar?";
    case "chamativa":
      return "Vou criar uma nova versão mais chamativa baseada nessa arte, mantendo as informações principais. Posso gerar?";
    case "mesma_ideia_melhorada":
      return "Vou criar uma nova versão baseada nessa arte, mantendo produto, marca, textos principais e informações comerciais, mas melhorando composição, visual e acabamento. Posso gerar?";
    default:
      return "Vou criar uma nova variação parecida com essa arte, mantendo produto, marca e informações principais, mas com composição e estilo diferentes. Posso gerar?";
  }
}

export default function MelhorarArteWizard() {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fase, setFase] = useState<Fase>("upload");
  const [preview, setPreview] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [opcaoEscolhida, setOpcaoEscolhida] = useState<Opcao | null>(null);
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
      setFase("intencao");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar a arte.");
      setPreview(null);
    } finally {
      setEnviandoFoto(false);
    }
  }

  function escolherOpcao(opcao: Opcao) {
    setOpcaoEscolhida(opcao);
    setErro(null);
    setFase(opcao.pedeInstrucao ? "instrucao" : "confirmando");
  }

  function confirmarInstrucao() {
    if (!instrucao.trim()) return;
    setFase("confirmando");
  }

  async function gerar() {
    if (!originalUrl || !opcaoEscolhida) return;
    setGerando(true);
    setErro(null);
    try {
      const res = await fetch("/api/melhorar-arte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagemOriginal: originalUrl,
          intencao: opcaoEscolhida.intencao,
          estiloDesejado: opcaoEscolhida.estiloDesejado,
          instrucaoUsuario: opcaoEscolhida.pedeInstrucao ? instrucao.trim() : undefined,
        }),
      });
      const json = await lerRespostaJSON<{ error?: string; projectId?: string; semCredito?: boolean }>(res);
      if (!res.ok || !json.projectId) throw new Error(json.error ?? "Erro ao gerar a nova versão.");
      router.push(`/resultado/${json.projectId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar a nova versão.");
      setGerando(false);
    }
  }

  const pareceAjustePontual = opcaoEscolhida?.pedeInstrucao && PALAVRAS_AJUSTE_PONTUAL.test(instrucao);

  return (
    <div className="flex flex-col flex-1 gap-5">
      <div>
        <h2 className="text-lg font-bold">Melhorar uma arte pronta</h2>
        <p className="text-sm text-[var(--muted)] mt-1">
          Envie uma arte que você já tem e crie uma versão mais profissional, refinada ou com novo
          estilo — sem passar pelo fluxo completo de criação.
        </p>
      </div>

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={fase === "gerando"}
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

      {fase === "intencao" && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm">O que você quer fazer com essa arte?</h3>
          <div className="flex flex-col gap-2 mt-3">
            {OPCOES.map((opcao) => (
              <button
                key={opcao.label}
                type="button"
                onClick={() => escolherOpcao(opcao)}
                className="text-sm font-medium bg-[var(--accent-soft)] px-4 py-2.5 rounded-full text-left"
              >
                {opcao.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {fase === "instrucao" && opcaoEscolhida && (
        <div className="card p-4">
          <h3 className="font-semibold text-sm">{opcaoEscolhida.label}</h3>
          <textarea
            className="input min-h-[80px] resize-none mt-3"
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            placeholder={opcaoEscolhida.placeholderInstrucao}
          />
          {pareceAjustePontual && (
            <p className="text-xs text-[var(--muted)] mt-2">
              💡 Isso parece um ajuste pontual (mudar só um ponto específico). Se for isso, o{" "}
              <a href="/editar" className="underline">
                fluxo de edição de design
              </a>{" "}
              costuma ficar mais preciso. Mas se quiser mesmo uma versão nova, pode continuar.
            </p>
          )}
          <div className="flex gap-2 mt-3">
            <button type="button" onClick={() => setFase("intencao")} className="btn btn-outline flex-1">
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

      {fase === "confirmando" && opcaoEscolhida && (
        <div className="card p-4">
          <p className="text-sm">{resumoConfirmacao(opcaoEscolhida, instrucao)}</p>
          {erro && <p className="text-sm text-[var(--danger)] mt-2">{erro}</p>}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={() => setFase(opcaoEscolhida.pedeInstrucao ? "instrucao" : "intencao")}
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
