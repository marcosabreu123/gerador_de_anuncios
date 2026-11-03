"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { lerRespostaJSON } from "@/lib/fetch-json";
import { baixarArte } from "@/lib/download";
import { aprovarPeca, registrarTempoPeca } from "@/app/clientes/actions";
import type { Peca } from "@/lib/agencia/types";

// Acompanhamento do lote. As peças são produzidas pelo worker da fila, então
// a tela precisa se atualizar sozinha — o operador aprova e vai fazer outra
// coisa, voltando quando o lote terminar.

const INTERVALO_ATUALIZACAO_MS = 6000;

export default function PecasDoPedido({ pecas, pedidoId }: { pecas: Peca[]; pedidoId: string }) {
  const router = useRouter();
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const emAndamento = pecas.some((p) => p.status === "pendente" || p.status === "gerando");

  // Só fica atualizando enquanto há trabalho em curso: lote concluído não
  // precisa de polling consumindo requisição à toa.
  useEffect(() => {
    if (!emAndamento) return;
    const timer = setInterval(() => router.refresh(), INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(timer);
  }, [emAndamento, router]);

  async function regerar(pecaId: string, texto?: string) {
    setErro(null);
    try {
      const res = await fetch("/api/pecas/regerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pecaId, instrucao: texto }),
      });
      const json = await lerRespostaJSON<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Erro ao regerar.");
      setAjustando(null);
      setInstrucao("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao regerar a peça.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {emAndamento && (
        <div className="card p-3 flex items-center gap-3">
          <span className="spinner" aria-hidden="true" />
          <p className="text-sm">
            Produzindo as peças… pode fechar esta tela, o lote continua rodando.
          </p>
        </div>
      )}

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {pecas.map((peca) => (
          <div key={peca.id} className="card p-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-sm">
                {peca.ordem + 1}. {peca.titulo}
              </p>
              <span className="badge shrink-0">{peca.status}</span>
            </div>

            {peca.imagem_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={peca.imagem_url} alt={peca.titulo ?? "Peça"} className="w-full rounded-xl" />
            ) : (
              <div className="w-full aspect-[4/5] rounded-xl bg-[var(--surface-muted)] flex items-center justify-center">
                <span className="text-sm text-[var(--muted)]">
                  {peca.status === "erro" ? "Falhou" : "Na fila…"}
                </span>
              </div>
            )}

            {peca.erro && <p className="text-xs text-[var(--danger)]">{peca.erro}</p>}

            {peca.imagem_url && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => baixarArte(peca.imagem_url!, `${peca.titulo ?? "arte"}.png`)}
                  className="btn btn-outline text-xs py-1"
                >
                  Baixar
                </button>
                <button
                  type="button"
                  onClick={() => setAjustando(ajustando === peca.id ? null : peca.id)}
                  className="btn btn-outline text-xs py-1"
                >
                  Ajustar
                </button>
                {peca.status !== "aprovada" && (
                  <form action={aprovarPeca}>
                    <input type="hidden" name="id" value={peca.id} />
                    <input type="hidden" name="pedido_id" value={pedidoId} />
                    <input type="hidden" name="cliente_id" value={peca.cliente_id} />
                    <button type="submit" className="btn btn-primary text-xs py-1">
                      Aprovar
                    </button>
                  </form>
                )}
              </div>
            )}

            {peca.status === "erro" && (
              <button type="button" onClick={() => regerar(peca.id)} className="btn btn-outline text-xs py-1 self-start">
                Tentar de novo
              </button>
            )}

            {ajustando === peca.id && (
              <div className="flex flex-col gap-2">
                <textarea
                  value={instrucao}
                  onChange={(e) => setInstrucao(e.target.value)}
                  className="input min-h-[60px] resize-none text-sm"
                  placeholder="O que mudar? Ex: deixa o preço maior, fundo mais escuro."
                />
                <button
                  type="button"
                  onClick={() => regerar(peca.id, instrucao)}
                  disabled={!instrucao.trim()}
                  className="btn btn-accent text-xs py-1 self-start"
                >
                  Regerar com esse ajuste
                </button>
              </div>
            )}

            {/* Tempo humano: é o número que decide se o pacote fecha a conta,
                já que o custo de API raramente é o gargalo. */}
            <form action={registrarTempoPeca} className="flex items-end gap-2">
              <input type="hidden" name="id" value={peca.id} />
              <input type="hidden" name="pedido_id" value={pedidoId} />
              <label className="flex flex-col gap-1">
                <span className="label text-[11px]">Seu tempo (min)</span>
                <input
                  name="minutos"
                  type="number"
                  min={0}
                  step="0.5"
                  defaultValue={
                    peca.tempo_operacao_segundos ? peca.tempo_operacao_segundos / 60 : undefined
                  }
                  className="input w-20 text-sm py-1"
                />
              </label>
              <button type="submit" className="btn btn-outline text-xs py-1">
                Salvar
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
