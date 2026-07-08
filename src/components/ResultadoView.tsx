"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { baixarArte } from "@/lib/download";
import { lerRespostaJSON } from "@/lib/fetch-json";
import AjusteConversa, { type ConfirmacaoAjuste } from "@/components/AjusteConversa";

export interface ArteItem {
  id: string;
  imagem_gerada_url: string;
  status: string;
}

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
  const [resetAjusteKey, setResetAjusteKey] = useState(0);
  const [gerandoVariacao, setGerandoVariacao] = useState(false);
  const [erroVariacao, setErroVariacao] = useState<string | null>(null);

  const arteAtual = artes.find((a) => a.id === selecionada) ?? artes[0];

  // Chamado pela mini conversa de ajuste (AjusteConversa) só quando o pedido
  // já está claro e o usuário confirmou — é aqui que 1 crédito é cobrado,
  // nunca durante a conversa de esclarecimento.
  async function aplicarAjuste({ pedidoFinal, anexoUrl, tipoUsoAnexo }: ConfirmacaoAjuste) {
    if (!arteAtual) return;
    const res = await fetch("/api/adjust", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageId: arteAtual.id, pedido: pedidoFinal, anexoUrl, tipoUsoAnexo }),
    });
    const json = await lerRespostaJSON<{ error?: string; imagem?: ArteItem }>(res);
    if (!res.ok || !json.imagem) throw new Error(json.error ?? "Erro ao ajustar.");
    const nova: ArteItem = { ...json.imagem, status: "ajustada" };
    setArtes((prev) => [nova, ...prev]);
    setSelecionada(nova.id);
    setResetAjusteKey((k) => k + 1); // reinicia a conversa de ajuste pra próxima rodada
    router.refresh(); // atualiza o saldo no header
  }

  async function gerarNovaVariacao() {
    setGerandoVariacao(true);
    setErroVariacao(null);
    try {
      const res = await fetch("/api/generate-variation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const json = await lerRespostaJSON<{ error?: string; imagem?: ArteItem }>(res);
      if (!res.ok || !json.imagem) throw new Error(json.error ?? "Erro ao gerar nova variação.");
      const nova: ArteItem = { ...json.imagem, status: "gerada" };
      setArtes((prev) => [nova, ...prev]);
      setSelecionada(nova.id);
      router.refresh(); // atualiza o saldo no header
    } catch (err) {
      setErroVariacao(err instanceof Error ? err.message : "Erro ao gerar nova variação.");
    } finally {
      setGerandoVariacao(false);
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

      {/* Nova variação a partir do mesmo briefing */}
      <button
        onClick={gerarNovaVariacao}
        disabled={gerandoVariacao}
        className="btn btn-outline btn-block"
      >
        {gerandoVariacao ? "Gerando nova variação…" : "🔁 Gerar outra variação (1 crédito)"}
      </button>
      {erroVariacao && <p className="text-sm text-[var(--danger)]">{erroVariacao}</p>}

      {/* Ajuste em linguagem natural — mini conversa: se o pedido for
          ambíguo, o usuário consegue responder a pergunta de esclarecimento
          em vez de ficar preso sem campo pra continuar. */}
      <div className="card p-4">
        <h3 className="font-semibold text-sm mb-1">Quer ajustar algo?</h3>
        <p className="text-xs text-[var(--muted)] mb-3">
          Escreva com suas palavras. Cada ajuste confirmado usa 1 crédito.
        </p>
        <AjusteConversa key={resetAjusteKey} onConfirmar={aplicarAjuste} sugestoes={sugestoes} />
      </div>
    </div>
  );
}
