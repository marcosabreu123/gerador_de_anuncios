"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Download, ImagePlus, Maximize2, PencilLine, Proportions, X } from "lucide-react";
import { lerRespostaJSON } from "@/lib/fetch-json";
import { baixarArte } from "@/lib/download";
import { enviarImagemParaStorage } from "@/lib/upload-storage";
import { aprovarPeca, registrarTempoPeca, usarVersaoPeca } from "@/app/(app)/clientes/actions";
import BotaoEnviar from "@/components/BotaoEnviar";
import Modal from "@/components/Modal";
import { SeloStatus } from "@/components/ui";
import {
  MAX_IMAGENS_AJUSTE,
  formatarBRL,
  type BriefingPecaManual,
  type Peca,
  type VersaoPeca,
} from "@/lib/agencia/types";
import { FORMATOS, type Formato } from "@/lib/types";

// Acompanhamento do lote. As peças são produzidas pelo worker da fila, então
// a tela precisa se atualizar sozinha — o operador aprova e vai fazer outra
// coisa, voltando quando o lote terminar.

const INTERVALO_ATUALIZACAO_MS = 6000;
const INTERVALO_CUTUCAO_MS = 30_000;

// Os formatos que o gerador de imagem aceita.
const TIPOS_ANEXO = ["image/png", "image/jpeg", "image/webp"];

function versoesDa(peca: Peca): VersaoPeca[] {
  return (peca.briefing as BriefingPecaManual | null)?.versoes ?? [];
}

function formatoDa(peca: Peca): Formato {
  return (peca.briefing as BriefingPecaManual | null)?.formato ?? "feed-4-5";
}

const TODOS_FORMATOS = Object.keys(FORMATOS) as Formato[];

export default function PecasDoPedido({
  pecas,
  pedidoId,
  ehSocio,
  creditos,
  emTeste = false,
  custoPorPeca,
}: {
  pecas: Peca[];
  pedidoId: string;
  ehSocio: boolean;
  // Créditos do cliente agora: cada arte aprovada usa 1.
  creditos: number;
  // Cliente em teste aprova sem crédito.
  emTeste?: boolean;
  // Só para o sócio: o que a API já gastou em cada peça, com ajustes e falhas.
  custoPorPeca?: Record<string, number>;
}) {
  const router = useRouter();
  // Aprovação recusada por falta de crédito, na peça em que aconteceu.
  const [avisoAprovacao, setAvisoAprovacao] = useState<{ pecaId: string; texto: string; podeForcar: boolean } | null>(
    null,
  );
  // "Outro formato": a peça com a escolha aberta, e o erro da última tentativa.
  const [formatoAberto, setFormatoAberto] = useState<string | null>(null);
  const [criandoFormato, setCriandoFormato] = useState(false);
  const [erroFormato, setErroFormato] = useState<{ texto: string; formato: Formato; podeForcar: boolean } | null>(
    null,
  );
  const [ajustando, setAjustando] = useState<string | null>(null);
  const [instrucao, setInstrucao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState<string | null>(null);
  const [versaoAberta, setVersaoAberta] = useState<{ pecaId: string; url: string } | null>(null);
  // Imagens anexadas ao ajuste: um produto, uma pessoa ou um estilo para levar à arte.
  const [anexos, setAnexos] = useState<string[]>([]);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);
  const [erroAnexo, setErroAnexo] = useState<string | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const inputAnexo = useRef<HTMLInputElement>(null);
  // As peças de um pedido são todas do mesmo cliente.
  const clienteId = pecas[0]?.cliente_id;

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

  // Do botão, de imagem colada na caixa ou arrastada para o ajuste.
  async function anexar(arquivos: File[]) {
    const imagens = arquivos.filter((a) => a.type.startsWith("image/"));
    if (imagens.length === 0 || enviandoAnexo || !clienteId) return;
    setErroAnexo(null);

    const aceitas = imagens.filter((a) => TIPOS_ANEXO.includes(a.type));
    const vagas = MAX_IMAGENS_AJUSTE - anexos.length;
    const avisos = [
      aceitas.length < imagens.length && "Só entram imagens PNG, JPG ou WEBP.",
      aceitas.length > vagas && `O limite é de ${MAX_IMAGENS_AJUSTE} imagens por ajuste.`,
    ].filter(Boolean);
    if (avisos.length) setErroAnexo(avisos.join(" "));
    if (aceitas.length === 0 || vagas <= 0) return;

    setEnviandoAnexo(true);
    try {
      const urls = await Promise.all(
        aceitas.slice(0, vagas).map((a) => enviarImagemParaStorage(a, `ajustes/${clienteId}`)),
      );
      setAnexos((atual) => [...atual, ...urls].slice(0, MAX_IMAGENS_AJUSTE));
    } catch (e) {
      setErroAnexo(e instanceof Error ? e.message : "Falha ao enviar a imagem.");
    } finally {
      setEnviandoAnexo(false);
    }
  }

  async function regerar(pecaId: string, texto?: string) {
    setErro(null);
    try {
      const res = await fetch("/api/pecas/regerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // "Tentar de novo" não leva imagem: as anexadas são de um ajuste.
        body: JSON.stringify({ pecaId, instrucao: texto, ...(texto && anexos.length ? { imagens: anexos } : {}) }),
      });
      const json = await lerRespostaJSON<{ error?: string }>(res);
      if (!res.ok) throw new Error(json.error ?? "Erro ao regerar.");
      setAjustando(null);
      setInstrucao("");
      if (texto) {
        setAnexos([]);
        setErroAnexo(null);
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao regerar a peça.");
    }
  }

  async function aprovar(form: FormData, pecaId: string) {
    setAvisoAprovacao(null);
    const resultado = await aprovarPeca(form);
    if (resultado.erro) {
      setAvisoAprovacao({ pecaId, texto: resultado.erro, podeForcar: Boolean(resultado.semCredito) && ehSocio });
    }
  }

  function abrirFormatos(pecaId: string) {
    setFormatoAberto(formatoAberto === pecaId ? null : pecaId);
    setErroFormato(null);
  }

  async function outroFormato(pecaId: string, formato: Formato, forcarSemSaldo = false) {
    setCriandoFormato(true);
    setErroFormato(null);
    try {
      const res = await fetch("/api/pecas/outro-formato", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pecaId, formato, forcarSemSaldo }),
      });
      const json = await lerRespostaJSON<{ error?: string; podeForcar?: boolean }>(res);
      if (!res.ok) {
        setErroFormato({
          texto: json.error ?? "Não consegui criar o outro formato.",
          formato,
          podeForcar: Boolean(json.podeForcar) && ehSocio,
        });
        return;
      }
      setFormatoAberto(null);
      router.refresh();
    } catch (e) {
      setErroFormato({
        texto: e instanceof Error ? e.message : "Não consegui criar o outro formato.",
        formato,
        podeForcar: false,
      });
    } finally {
      setCriandoFormato(false);
    }
  }

  // Arte pronta e ainda sem aprovação: é aqui que o crédito vai sair.
  const esperandoAprovacao = pecas.some((p) => p.imagem_url && p.status === "gerada");

  // Com uma peça só o card deita: imagem de um lado, ações do outro. Em pé, ela
  // ficaria perdida num canto da tela do PC. A altura da arte acompanha a janela
  // para ela caber inteira no notebook, sem precisar rolar.
  const unica = pecas.length === 1;

  const pecaDaVersao = versaoAberta && pecas.find((p) => p.id === versaoAberta.pecaId);
  const versoesAbertas = pecaDaVersao ? versoesDa(pecaDaVersao) : [];
  const indiceAberto = versoesAbertas.findIndex((v) => v.url === versaoAberta?.url);
  const versao = versoesAbertas[indiceAberto];

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

      {esperandoAprovacao && (
        <p className="text-[13px] text-[var(--muted)]">
          {emTeste ? (
            "Cliente em teste: aprovar não usa crédito."
          ) : (
            <>
              Cada arte aprovada usa 1 crédito, uma vez só. O cliente tem{" "}
              <span className={creditos < 1 ? "text-[var(--danger)] font-medium" : "text-[var(--foreground)]"}>
                {creditos === 1 ? "1 crédito" : `${creditos} créditos`}
              </span>
              .
            </>
          )}
        </p>
      )}

      {/* Um só para todas as peças: quem abre é o botão "Anexar imagem" do ajuste. */}
      <input
        ref={inputAnexo}
        type="file"
        accept={TIPOS_ANEXO.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          const arquivos = Array.from(e.target.files ?? []);
          e.target.value = "";
          void anexar(arquivos);
        }}
      />

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
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm truncate" title={peca.titulo ?? undefined}>
                    {peca.ordem + 1}. {peca.titulo}
                  </p>
                  <SeloStatus status={peca.status} />
                </div>
                {/* Todo o gasto até a aprovação: variações, ajustes e falhas desta peça. */}
                {custoPorPeca && (custoPorPeca[peca.id] ?? 0) > 0 && (
                  <p className="text-xs text-[var(--muted)] tabular-nums">
                    {formatarBRL(custoPorPeca[peca.id])} de API até aqui
                  </p>
                )}
              </div>

              {peca.erro && <p className="text-[13px] text-[var(--danger)]">{peca.erro}</p>}

              {peca.imagem_url && (
                <div className="flex flex-wrap gap-2">
                  {peca.status !== "aprovada" && (
                    <form action={(form) => aprovar(form, peca.id)}>
                      <input type="hidden" name="id" value={peca.id} />
                      <BotaoEnviar
                        className="btn btn-primary btn-sm"
                        title={
                          emTeste
                            ? "Cliente em teste: não usa crédito"
                            : peca.pacote_consumido
                              ? "O crédito desta arte já foi usado"
                              : "Usa 1 crédito do cliente"
                        }
                      >
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
                  {peca.status !== "pendente" && peca.status !== "gerando" && (
                    <button
                      type="button"
                      onClick={() => abrirFormatos(peca.id)}
                      aria-expanded={formatoAberto === peca.id}
                      title="A mesma arte em outra proporção, como peça nova"
                      className="btn btn-outline btn-sm"
                    >
                      <Proportions size={14} aria-hidden="true" />
                      Outro formato
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

              {avisoAprovacao?.pecaId === peca.id && (
                <div className="flex flex-col items-start gap-2">
                  <p className="text-[13px] text-[var(--danger)]">{avisoAprovacao.texto}</p>
                  {avisoAprovacao.podeForcar && (
                    <form action={(form) => aprovar(form, peca.id)}>
                      <input type="hidden" name="id" value={peca.id} />
                      <input type="hidden" name="sem_credito" value="sim" />
                      <BotaoEnviar className="btn btn-outline btn-sm">Aprovar sem debitar</BotaoEnviar>
                    </form>
                  )}
                </div>
              )}

              {/* A arte vira uma peça nova no formato escolhido; esta fica como está. */}
              {formatoAberto === peca.id && peca.imagem_url && (
                <div className="quadro p-3 flex flex-col gap-2.5">
                  <p className="text-[13px] text-[var(--muted)]">
                    Cria outra peça com os mesmos textos, produto e identidade. Esta continua como está.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {TODOS_FORMATOS.filter((f) => f !== formatoDa(peca)).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => outroFormato(peca.id, f)}
                        disabled={criandoFormato}
                        className="btn btn-outline btn-sm"
                      >
                        {FORMATOS[f].label} <span className="opacity-60">{FORMATOS[f].aspecto}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFormatoAberto(null)}
                      disabled={criandoFormato}
                      className="btn btn-ghost btn-sm"
                    >
                      Cancelar
                    </button>
                  </div>
                  {criandoFormato && (
                    <p className="flex items-center gap-2 text-[13px] text-[var(--muted)]">
                      <span className="spinner" aria-hidden="true" />
                      Criando a peça…
                    </p>
                  )}
                  {erroFormato && (
                    <div className="flex flex-col items-start gap-2">
                      <p className="text-[13px] text-[var(--danger)]">{erroFormato.texto}</p>
                      {erroFormato.podeForcar && (
                        <button
                          type="button"
                          onClick={() => outroFormato(peca.id, erroFormato.formato, true)}
                          disabled={criandoFormato}
                          className="btn btn-outline btn-sm"
                        >
                          Gerar mesmo sem crédito
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {peca.status === "erro" && (
                <button type="button" onClick={() => regerar(peca.id)} className="btn btn-outline btn-sm self-start">
                  Tentar de novo
                </button>
              )}

              {/* Toda imagem que a peça já teve fica aqui: um ajuste pode piorar a arte,
                  e a anterior precisa continuar ao alcance. */}
              {versoesDa(peca).length > 1 && (
                <div className="flex flex-col gap-1.5 border-t border-[var(--border)] pt-3">
                  <span className="text-[13px] text-[var(--muted)]">Versões desta arte</span>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {versoesDa(peca).map((v, i) => (
                      <button
                        key={v.url}
                        type="button"
                        onClick={() => setVersaoAberta({ pecaId: peca.id, url: v.url })}
                        title={v.ajuste ?? "Primeira versão"}
                        aria-label={`Abrir a versão ${i + 1}`}
                        aria-current={v.url === peca.imagem_url}
                        className={`shrink-0 rounded-[10px] overflow-hidden border-2 ${
                          v.url === peca.imagem_url ? "border-[var(--foreground)]" : "border-transparent"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={v.url} alt="" loading="lazy" className="h-16 w-auto" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {peca.imagem_url && (unica || ajustando === peca.id) && (
                <div
                  className={`flex flex-col gap-2 rounded-lg ${unica ? "flex-1 border-t border-[var(--border)] pt-3" : ""} ${
                    arrastando ? "outline-2 outline-dashed outline-offset-4 outline-[var(--border-strong)]" : ""
                  }`}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    setArrastando(true);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArrastando(false);
                  }}
                  onDrop={(e) => {
                    if (!e.dataTransfer.types.includes("Files")) return;
                    e.preventDefault();
                    setArrastando(false);
                    void anexar(Array.from(e.dataTransfer.files));
                  }}
                >
                  {unica && (
                    <label htmlFor={`ajuste-${peca.id}`} className="text-sm font-medium">
                      Ajustar esta arte
                    </label>
                  )}
                  <textarea
                    id={`ajuste-${peca.id}`}
                    value={instrucao}
                    onChange={(e) => setInstrucao(e.target.value)}
                    onPaste={(e) => {
                      // Imagem copiada do WhatsApp ou do navegador vira anexo; texto cola normal.
                      const arquivos = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
                      if (arquivos.length === 0) return;
                      e.preventDefault();
                      void anexar(arquivos);
                    }}
                    className={`input resize-y ${unica ? "flex-1 min-h-24" : "min-h-[72px]"}`}
                    placeholder="O que mudar? Ex: deixa o preço maior, passa para story, coloca o lanche da imagem 1. Dá para colar imagem aqui."
                  />

                  {anexos.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex flex-wrap gap-2.5 pt-1.5">
                        {anexos.map((url, i) => (
                          <div key={url} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={url}
                              alt={`Imagem anexada ${i + 1}`}
                              className="h-14 w-14 rounded-lg object-cover border border-[var(--border)]"
                            />
                            {anexos.length > 1 && (
                              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[11px] leading-4 text-white">
                                {i + 1}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setAnexos((atual) => atual.filter((u) => u !== url))}
                              aria-label={`Tirar a imagem ${i + 1}`}
                              title="Tirar esta imagem"
                              className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-5 h-5 rounded-full bg-[var(--foreground)] text-[var(--background)]"
                            >
                              <X size={12} aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-[13px] text-[var(--muted)]">
                        {anexos.length > 1
                          ? "Diga no texto o que usar de cada imagem, pelo número."
                          : "Diga no texto o que usar da imagem."}
                      </p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => regerar(peca.id, instrucao)}
                      disabled={!instrucao.trim() || enviandoAnexo}
                      className="btn btn-primary btn-sm"
                    >
                      Regerar com esse ajuste
                    </button>
                    <button
                      type="button"
                      onClick={() => inputAnexo.current?.click()}
                      disabled={enviandoAnexo || anexos.length >= MAX_IMAGENS_AJUSTE}
                      title={`Até ${MAX_IMAGENS_AJUSTE} imagens: um produto, uma pessoa ou um estilo para levar à arte`}
                      className="btn btn-outline btn-sm"
                    >
                      {enviandoAnexo ? (
                        <span className="spinner" aria-hidden="true" />
                      ) : (
                        <ImagePlus size={14} aria-hidden="true" />
                      )}
                      {enviandoAnexo ? "Enviando…" : "Anexar imagem"}
                    </button>
                  </div>
                  {erroAnexo && <p className="text-[13px] text-[var(--danger)]">{erroAnexo}</p>}
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

      {pecaDaVersao && versao && (
        <Modal
          titulo={`Versão ${indiceAberto + 1} de ${versoesAbertas.length}`}
          aoFechar={() => setVersaoAberta(null)}
          largo
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={versao.url} alt="" className="w-full max-h-[62dvh] object-contain rounded-[10px]" />
          <p className="text-[13px] text-[var(--muted)]">
            {versao.ajuste ? `Pedido: ${versao.ajuste}` : "Primeira versão desta arte."}
          </p>
          {versao.imagensAjuste && versao.imagensAjuste.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-[var(--muted)]">Imagens anexadas:</span>
              {versao.imagensAjuste.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt={`Imagem anexada ${i + 1}`}
                  className="h-12 w-12 rounded-md object-cover border border-[var(--border)]"
                />
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {versao.url === pecaDaVersao.imagem_url ? (
              <span className="text-sm">Esta é a versão em uso.</span>
            ) : (
              <form
                action={async (form) => {
                  await usarVersaoPeca(form);
                  setVersaoAberta(null);
                }}
              >
                <input type="hidden" name="id" value={pecaDaVersao.id} />
                <input type="hidden" name="pedido_id" value={pedidoId} />
                <input type="hidden" name="url" value={versao.url} />
                <BotaoEnviar className="btn btn-primary btn-sm">
                  <Check size={14} aria-hidden="true" />
                  Usar esta versão
                </BotaoEnviar>
              </form>
            )}
            <button
              type="button"
              onClick={() => baixarArte(versao.url, `${pecaDaVersao.titulo ?? "arte"}-versao-${indiceAberto + 1}.png`)}
              className="btn btn-outline btn-sm"
            >
              <Download size={14} aria-hidden="true" />
              Baixar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
