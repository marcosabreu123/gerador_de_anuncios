"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, Maximize2, PencilLine } from "lucide-react";
import { lerRespostaJSON } from "@/lib/fetch-json";
import { baixarArte } from "@/lib/download";
import { aprovarPeca, registrarTempoPeca } from "@/app/(app)/clientes/actions";
import BotaoEnviar from "@/components/BotaoEnviar";
import Modal from "@/components/Modal";
import { SeloStatus } from "@/components/ui";
import type { Peca } from "@/lib/agencia/types";

// Acompanhamento do lote. As peças são produzidas pelo worker da fila, então
// a tela precisa se atualizar sozinha — o operador aprova e vai fazer outra
// coisa, voltando quando o lote terminar.

const INTERVALO_ATUALIZACAO_MS = 6000;
const INTERVALO_CUTUCAO_MS = 30_000;

export default function PecasDoPedido({ pecas, pedidoId }: { pecas: Peca[]; pedidoId: string }) {
  const router = useRouter();
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);

  const emAndamento = pecas.some((p) => p.status === "pendente" || p.status === "gerando");
  const paradas = pecas.filter((p) => p.status === "pendente").length;

  // Só fica atualizando enquanto há trabalho em curso: lote concluído não
  // precisa de polling consumindo requisição à toa.
  useEffect(() => {
    if (!emAndamento) return;
    const timer = setInterval(() => router.refresh(), INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(timer);
  }, [emAndamento, router]);

  // Enquanto houver peça parada na fila, esta tela chama o worker. É a forma
  // mais confiável de o lote andar: o disparo feito pelo servidor na hora do
  // pedido depende de a função sobreviver à resposta, e o cron só passa de
  // minuto em minuto. Uma chamada por peça parada, porque cada invocação
  // produz uma peça — assim um lote de 4 sai junto, não em 4 minutos.
  //
  // Chamar à toa é inofensivo: a reserva do job é atômica, então uma invocação
  // que chega sem ter o que fazer volta na hora sem gastar nada.
  useEffect(() => {
    if (paradas === 0) return;

    const cutucar = () => {
      for (let i = 0; i < Math.min(paradas, 4); i += 1) {
        void fetch("/api/fila/processar", { method: "POST" }).catch(() => {});
      }
    };

    cutucar();
    const timer = setInterval(cutucar, INTERVALO_CUTUCAO_MS);
    return () => clearInterval(timer);
  }, [paradas]);

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

  // Com uma peça só o card deita: imagem de um lado, ações do outro. Em pé, ela
  // ficaria perdida num canto da tela do PC. A altura da arte acompanha a janela
  // para ela caber inteira no notebook, sem precisar rolar.
  const unica = pecas.length === 1;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {emAndamento && (
        <div className="card px-4 py-3 flex items-center gap-3">
          <span className="spinner" aria-hidden="true" />
          <p className="text-sm">
            Produzindo as peças… pode fechar esta tela, o lote continua rodando.
          </p>
        </div>
      )}

      {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

      <div className={unica ? "" : "grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4"}>
        {pecas.map((peca) => (
          <div
            key={peca.id}
            className={`card p-3 min-w-0 ${
              unica ? "grid grid-cols-1 lg:grid-cols-[auto_minmax(0,1fr)] gap-5" : "flex flex-col gap-3"
            }`}
          >
            {peca.imagem_url ? (
              <button
                type="button"
                onClick={() => setAmpliada(peca.imagem_url)}
                className="relative block rounded-[10px] overflow-hidden cursor-zoom-in group"
                title="Ver em tamanho real"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={peca.imagem_url}
                  alt={peca.titulo ?? "Peça"}
                  className={`w-full ${unica ? "lg:w-auto lg:max-w-[480px] lg:max-h-[calc(100dvh-12rem)]" : ""}`}
                />
                <span className="absolute top-2 right-2 flex items-center justify-center w-8 h-8 rounded-lg bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Maximize2 size={14} aria-hidden="true" />
                </span>
              </button>
            ) : (
              <div
                className={`w-full aspect-[4/5] rounded-[10px] flex items-center justify-center ${
                  unica ? "lg:w-[400px]" : ""
                } ${peca.status === "erro" ? "bg-[var(--surface-muted)]" : "esqueleto"}`}
              >
                <span className="text-sm text-[var(--muted)]">
                  {peca.status === "erro" ? "Falhou" : peca.status === "gerando" ? "Gerando…" : "Na fila…"}
                </span>
              </div>
            )}

            <div className={`flex flex-col gap-3 min-w-0 ${unica ? "lg:py-2 lg:pr-2" : "px-1 pb-1 flex-1"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sm truncate" title={peca.titulo ?? undefined}>
                  {peca.ordem + 1}. {peca.titulo}
                </p>
                <SeloStatus status={peca.status} />
              </div>

              {peca.erro && <p className="text-[13px] text-[var(--danger)]">{peca.erro}</p>}

              {peca.imagem_url && (
                <div className="flex flex-wrap gap-2">
                  {peca.status !== "aprovada" && (
                    <form action={aprovarPeca}>
                      <input type="hidden" name="id" value={peca.id} />
                      <input type="hidden" name="pedido_id" value={pedidoId} />
                      <input type="hidden" name="cliente_id" value={peca.cliente_id} />
                      <BotaoEnviar className="btn btn-primary btn-sm">
                        <Check size={14} aria-hidden="true" />
                        Aprovar
                      </BotaoEnviar>
                    </form>
                  )}
                  {!unica && (
                    <button
                      type="button"
                      onClick={() => setAjustando(ajustando === peca.id ? null : peca.id)}
                      aria-expanded={ajustando === peca.id}
                      className="btn btn-outline btn-sm"
                    >
                      <PencilLine size={14} aria-hidden="true" />
                      Ajustar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => baixarArte(peca.imagem_url!, `${peca.titulo ?? "arte"}.png`)}
                    className="btn btn-outline btn-sm"
                  >
                    <Download size={14} aria-hidden="true" />
                    Baixar
                  </button>
                </div>
              )}

              {peca.status === "erro" && (
                <button type="button" onClick={() => regerar(peca.id)} className="btn btn-outline btn-sm self-start">
                  Tentar de novo
                </button>
              )}

              {peca.imagem_url && (unica || ajustando === peca.id) && (
                <div className={`flex flex-col gap-2 ${unica ? "flex-1 border-t border-[var(--border)] pt-3" : ""}`}>
                  {unica && (
                    <label htmlFor={`ajuste-${peca.id}`} className="text-sm font-medium">
                      Ajustar esta arte
                    </label>
                  )}
                  <textarea
                    id={`ajuste-${peca.id}`}
                    value={instrucao}
                    onChange={(e) => setInstrucao(e.target.value)}
                    className={`input resize-y ${unica ? "flex-1 min-h-24" : "min-h-[72px]"}`}
                    placeholder="O que mudar? Ex: deixa o preço maior, fundo mais escuro."
                  />
                  <button
                    type="button"
                    onClick={() => regerar(peca.id, instrucao)}
                    disabled={!instrucao.trim()}
                    className="btn btn-primary btn-sm self-start"
                  >
                    Regerar com esse ajuste
                  </button>
                </div>
              )}

              {/* Tempo humano: é o número que decide se o pacote fecha a conta,
                  já que o custo de API raramente é o gargalo. Só aparece quando
                  há arte: em peça na fila o campo não diz nada. */}
              {peca.imagem_url && (
                <form
                  action={registrarTempoPeca}
                  className="flex items-center gap-2 border-t border-[var(--border)] pt-3 mt-auto"
                >
                  <input type="hidden" name="id" value={peca.id} />
                  <input type="hidden" name="pedido_id" value={pedidoId} />
                  <label className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-[13px] text-[var(--muted)]">Seu tempo (min)</span>
                    <input
                      name="minutos"
                      type="number"
                      min={0}
                      step="0.5"
                      defaultValue={
                        peca.tempo_operacao_segundos ? peca.tempo_operacao_segundos / 60 : undefined
                      }
                      className="input w-20 min-h-8 py-1"
                    />
                  </label>
                  <BotaoEnviar className="btn btn-ghost btn-sm">Salvar</BotaoEnviar>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>

      {ampliada && (
        <Modal titulo="Arte em tamanho real" aoFechar={() => setAmpliada(null)} largo>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={ampliada} alt="Arte em tamanho real" className="w-full max-h-[80dvh] object-contain rounded-[10px]" />
        </Modal>
      )}
    </div>
  );
}
