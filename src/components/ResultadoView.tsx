"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baixarArte } from "@/lib/download";

export interface ArteItem {
  id: string;
  imagem_gerada_url: string;
  status: string;
}

// Antes de gastar 1 crédito de imagem, o pedido passa por uma classificação:
// "ajuste" pede confirmação direta; "nova-criacao"/"ambiguo" avisa que parece
// uma mudança grande e oferece recomeçar do zero (ver /api/adjust-classify).
type Fase = "digitando" | "classificando" | "confirmando-ajuste" | "confirmando-grande";

export default function ResultadoView({
  projectId,
  nomeProjeto,
  ratioClass,
  inicial,
}: {
  projectId: string;
  nomeProjeto: string;
  ratioClass: string;
  inicial: ArteItem[];
}) {
  const router = useRouter();
  const [artes, setArtes] = useState<ArteItem[]>(inicial);
  const [selecionada, setSelecionada] = useState<string>(inicial[0]?.id ?? "");
  const [pedido, setPedido] = useState("");
  const [fase, setFase] = useState<Fase>("digitando");
  const [resumo, setResumo] = useState("");
  const [ajustando, setAjustando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const arteAtual = artes.find((a) => a.id === selecionada) ?? artes[0];

  async function classificar() {
    if (!pedido.trim()) return;
    setErro(null);
    setFase("classificando");
    try {
      const res = await fetch("/api/adjust-classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao entender o pedido.");
      setResumo(json.resumo ?? pedido);
      setFase(json.tipo === "ajuste" ? "confirmando-ajuste" : "confirmando-grande");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao entender o pedido.");
      setFase("digitando");
    }
  }

  function cancelar() {
    setFase("digitando");
    setResumo("");
  }

  async function aplicarAjuste() {
    if (!pedido.trim() || !arteAtual) return;
    setAjustando(true);
    setErro(null);
    try {
      const res = await fetch("/api/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageId: arteAtual.id, pedido }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erro ao ajustar.");
      const nova: ArteItem = { ...json.imagem, status: "ajustada" };
      setArtes((prev) => [nova, ...prev]);
      setSelecionada(nova.id);
      setPedido("");
      setFase("digitando");
      router.refresh(); // atualiza o saldo no header
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao ajustar.");
    } finally {
      setAjustando(false);
    }
  }

  const sugestoes = [
    "Deixe mais premium",
    "Aumente o produto",
    "Melhore a leitura do preço",
    "Fundo mais clean",
  ];

  if (!arteAtual) {
    return <p className="text-sm text-[var(--muted)]">Nenhuma arte encontrada.</p>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Arte em destaque */}
      <div className={`card overflow-hidden w-full ${ratioClass} bg-[var(--accent-soft)]`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={arteAtual.imagem_gerada_url}
          alt={nomeProjeto}
          className="w-full h-full object-contain"
        />
      </div>

      {/* Miniaturas das variações */}
      {artes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {artes.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelecionada(a.id)}
              className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 ${
                a.id === selecionada ? "border-[var(--accent)]" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={a.imagem_gerada_url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      {/* Download */}
      <button
        onClick={() =>
          baixarArte(arteAtual.imagem_gerada_url, `${nomeProjeto || "arte"}-${projectId.slice(0, 6)}.png`)
        }
        className="btn btn-primary btn-block"
      >
        ⬇ Baixar esta arte
      </button>

      {/* Ajuste em linguagem natural */}
      <div className="card p-4">
        <h3 className="font-semibold text-sm">Quer ajustar algo?</h3>

        {fase === "confirmando-ajuste" ? (
          <div className="mt-3">
            <p className="text-sm">
              Vou alterar: <strong>{resumo}</strong>. Mantendo todo o resto igual.
            </p>
            {erro && <p className="text-sm text-[var(--danger)] mt-2">{erro}</p>}
            <div className="flex gap-2 mt-3">
              <button onClick={cancelar} disabled={ajustando} className="btn btn-outline flex-1">
                Cancelar
              </button>
              <button onClick={aplicarAjuste} disabled={ajustando} className="btn btn-accent flex-1">
                {ajustando ? "Aplicando…" : "Confirmar (1 crédito)"}
              </button>
            </div>
          </div>
        ) : fase === "confirmando-grande" ? (
          <div className="mt-3">
            <p className="text-sm">
              Isso parece uma mudança grande: <strong>{resumo}</strong>. Quer criar uma versão nova, ou
              só ajustar esse ponto específico na arte atual?
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => router.push("/novo")} className="btn btn-outline flex-1">
                Criar versão nova
              </button>
              <button onClick={() => setFase("confirmando-ajuste")} className="btn btn-accent flex-1">
                Só ajustar isso
              </button>
            </div>
            <button onClick={cancelar} className="text-xs text-[var(--muted)] underline mt-2">
              Cancelar
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-[var(--muted)] mt-1 mb-3">
              Escreva com suas palavras. Cada ajuste usa 1 crédito.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              {sugestoes.map((s) => (
                <button
                  key={s}
                  onClick={() => setPedido(s)}
                  className="text-xs bg-[var(--accent-soft)] px-3 py-1.5 rounded-full"
                >
                  {s}
                </button>
              ))}
            </div>
            <textarea
              className="input min-h-[80px] resize-none"
              value={pedido}
              onChange={(e) => setPedido(e.target.value)}
              placeholder="Ex: deixe o fundo mais escuro e aumente o nome do perfume"
            />
            {erro && <p className="text-sm text-[var(--danger)] mt-2">{erro}</p>}
            <button
              onClick={classificar}
              disabled={fase === "classificando" || !pedido.trim()}
              className="btn btn-accent btn-block mt-3"
            >
              {fase === "classificando" ? "Entendendo o pedido…" : "Aplicar ajuste"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
