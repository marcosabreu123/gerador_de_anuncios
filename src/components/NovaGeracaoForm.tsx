"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ImagePlus, Mic, Minus, Sparkles, Square, WandSparkles } from "lucide-react";
import { lerRespostaJSON } from "@/lib/fetch-json";
import GerandoMensagem from "@/components/GerandoMensagem";
import { TituloCard } from "@/components/ui";
import { enviarImagemParaStorage } from "@/lib/upload-storage";
import { formatarDia } from "@/lib/datas";
import type { DataProxima } from "@/lib/agencia/calendario";
import type { PedidoParaRepetir } from "@/lib/agencia/repetir-pedido";
import type { ModoImagemEnviada, Referencia } from "@/lib/agencia/types";
import type { EstiloComunicacao, Formato, IntensidadeVisual, TipoImagem } from "@/lib/types";

// Tela de produção. O operador escreve ou fala o pedido, ajusta os controles
// e manda gerar — sem etapa intermediária de aprovar plano.
//
// Os controles existem porque o agente não deve adivinhar o que é decisão do
// operador: quantidade, formato e intensidade são escolha de quem conhece o
// cliente. O que o agente faz é ler o perfil da empresa (identidade, nicho,
// regras, materiais) e traduzir o pedido em direção de arte.
//
// "Melhorar minha ideia" é opcional: a IA sugere um briefing, e ele só entra no
// pedido se o operador aprovar. Quem não quiser continua gerando direto.

// Abaixo disso quase sempre falta o que vender, para quem ou o que fazer.
const PALAVRAS_DE_IDEIA_CURTA = 12;

interface SugestaoDeBriefing {
  // Null quando a IA considerou que a ideia já está boa.
  briefing: string | null;
  faltou: string[];
  avisos: string[];
}

const QUANTIDADES = [1, 2, 3, 4] as const;

const FORMATOS: { valor: Formato; label: string; ajuda: string; proporcao: string }[] = [
  { valor: "story-9-16", label: "Story", ajuda: "9:16", proporcao: "9 / 16" },
  { valor: "feed-4-5", label: "Feed", ajuda: "4:5", proporcao: "4 / 5" },
  { valor: "quadrado-1-1", label: "Quadrado", ajuda: "1:1", proporcao: "1 / 1" },
];

const MODOS_DA_IMAGEM: { valor: ModoImagemEnviada; label: string; ajuda: string }[] = [
  { valor: "referencia", label: "Usar como referência", ajuda: "Seu pedido manda, e a imagem é só inspiração." },
  {
    valor: "melhoria_recompositiva",
    label: "Melhorar esta arte",
    ajuda: "Mesma campanha, composição melhor. O que você escrever vale mais que a arte.",
  },
  {
    valor: "nova_versao_criativa",
    label: "Criar nova versão",
    ajuda: "Mesmas informações, design novo. O que você escrever vale mais que a arte.",
  },
];

const ESTILOS: { valor: EstiloComunicacao; label: string }[] = [
  { valor: "ia_decide", label: "IA decide" },
  { valor: "premium", label: "Premium" },
  { valor: "moderno", label: "Moderno" },
  { valor: "clean", label: "Clean" },
  { valor: "vibrante", label: "Vibrante" },
  { valor: "minimalista", label: "Minimalista" },
];

const TIPOS_IMAGEM: { valor: TipoImagem; label: string; ajuda: string }[] = [
  { valor: "ia_decide", label: "IA decide", ajuda: "" },
  { valor: "foto", label: "Foto realista", ajuda: "Cena fotográfica, com luz e materiais de verdade." },
  { valor: "grafico", label: "Gráfico", ajuda: "Fundo de design, como um flyer feito no Canva." },
  { valor: "ilustracao", label: "Ilustração", ajuda: "Tudo desenhado, inclusive o produto e o fundo." },
];

const INTENSIDADES: { valor: IntensidadeVisual; label: string }[] = [
  { valor: "ia_decide", label: "IA decide" },
  { valor: "discreta", label: "Discreta" },
  { valor: "equilibrada", label: "Equilibrada" },
  { valor: "impactante", label: "Impactante" },
];

export default function NovaGeracaoForm({
  clienteId,
  saldoDisponivel,
  planoVencidoEm,
  ehSocio,
  fotosProduto,
  materiais,
  datas,
  repetir,
}: {
  clienteId: string;
  saldoDisponivel: number;
  // Vencimento do plano quando é ele que zerou o saldo.
  planoVencidoEm?: string | null;
  ehSocio: boolean;
  fotosProduto: Referencia[];
  materiais: { tipo: string; label: string; tem: boolean }[];
  datas: DataProxima[];
  repetir?: PedidoParaRepetir | null;
}) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(repetir?.prompt ?? "");
  const [quantidade, setQuantidade] = useState<number>(repetir?.quantidade ?? 1);
  const [formato, setFormato] = useState<Formato>(repetir?.formato ?? "story-9-16");
  const [estilo, setEstilo] = useState<EstiloComunicacao>(repetir?.estilo ?? "ia_decide");
  const [intensidade, setIntensidade] = useState<IntensidadeVisual>(repetir?.intensidade ?? "ia_decide");
  const [tipoImagem, setTipoImagem] = useState<TipoImagem>(repetir?.tipoImagem ?? "ia_decide");
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [podeForcar, setPodeForcar] = useState(false);
  // Imagem enviada junto do pedido. O modo diz o que a geração faz com ela.
  const [arteBaseUrl, setArteBaseUrl] = useState<string | null>(repetir?.arteBaseUrl ?? null);
  const [modoTransformacao, setModoTransformacao] = useState<ModoImagemEnviada>(
    repetir?.modoTransformacao ?? "referencia",
  );
  const [subindoArte, setSubindoArte] = useState(false);
  // Com uma foto só ela já vem marcada. Com várias, a escolha é do operador: o
  // modelo trata o anexo como o produto da peça, e a foto errada estraga a arte.
  // Ao repetir, vale a escolha do pedido antigo, inclusive "Nenhuma", se a foto ainda existir.
  const [produtoRefId, setProdutoRefId] = useState<string | null>(() => {
    if (repetir) return fotosProduto.some((f) => f.id === repetir.produtoRefId) ? repetir.produtoRefId : null;
    return fotosProduto.length === 1 ? fotosProduto[0].id : null;
  });
  const [sugestao, setSugestao] = useState<SugestaoDeBriefing | null>(null);
  const [melhorando, setMelhorando] = useState(false);
  const [erroMelhoria, setErroMelhoria] = useState<string | null>(null);
  // O que o operador tinha escrito antes de aprovar: a aprovação pode ser desfeita.
  const [textoAntes, setTextoAntes] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const destinoAudioRef = useRef<"gerar" | "melhorar">("gerar");
  // O fim da gravação acontece fora do render em que ela começou. Sem a versão
  // mais recente do envio, um formato trocado durante a gravação se perderia.
  const enviarRef = useRef<typeof enviar>(null);
  const melhorarRef = useRef<typeof melhorar>(null);
  useEffect(() => {
    enviarRef.current = enviar;
    melhorarRef.current = melhorar;
  });

  // Em tela baixa a sugestão nasce abaixo da dobra, com o aprovar fora de vista.
  // A margem de rolagem no card desconta o menu fixo do celular.
  const sugestaoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (sugestao) sugestaoRef.current?.scrollIntoView({ block: "nearest" });
  }, [sugestao]);

  async function iniciarGravacao() {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // Libera o microfone na hora — senão o indicador do navegador fica
        // aceso depois que o áudio já foi enviado.
        stream.getTracks().forEach((t) => t.stop());
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (destinoAudioRef.current === "melhorar") void melhorarRef.current?.(audio);
        else void enviarRef.current?.(audio);
      };
      recorder.start();
      recorderRef.current = recorder;
      setGravando(true);
    } catch {
      setErro("Não consegui acessar o microfone. Você pode digitar o pedido abaixo.");
    }
  }

  function pararGravacao(destino: "gerar" | "melhorar") {
    destinoAudioRef.current = destino;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setGravando(false);
    if (destino === "gerar") setTranscrevendo(true);
    else setMelhorando(true);
  }

  async function melhorar(audio?: Blob) {
    setMelhorando(true);
    setErroMelhoria(null);
    try {
      let res: Response;
      if (audio) {
        const form = new FormData();
        form.append("clienteId", clienteId);
        form.append("ideia", prompt);
        form.append("audio", audio, "pedido.webm");
        if (arteBaseUrl) form.append("imagemUrl", arteBaseUrl);
        res = await fetch("/api/geracoes/melhorar-ideia", { method: "POST", body: form });
      } else {
        res = await fetch("/api/geracoes/melhorar-ideia", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clienteId,
            ideia: prompt,
            anterior: sugestao?.briefing,
            ...(arteBaseUrl ? { imagemUrl: arteBaseUrl } : {}),
          }),
        });
      }

      const json = await lerRespostaJSON<{
        error?: string;
        ideia?: string;
        briefing?: string | null;
        faltou?: string[];
        avisos?: string[];
      }>(res);

      // O áudio já virou texto: fica na caixa mesmo se a melhoria falhar.
      if (json.ideia) setPrompt(json.ideia);
      if (!res.ok) throw new Error(json.error ?? "Não consegui melhorar agora.");

      setSugestao({ briefing: json.briefing ?? null, faltou: json.faltou ?? [], avisos: json.avisos ?? [] });
    } catch (e) {
      setErroMelhoria(e instanceof Error ? e.message : "Não consegui melhorar agora.");
    } finally {
      setMelhorando(false);
    }
  }

  // A data entra como pedido de data, que o redator e o diretor já sabem tratar. Com
  // texto na caixa, ela vai junto em vez de apagar o que o operador escreveu.
  function usarData(data: DataProxima) {
    const atual = prompt.trim();
    if (atual.toLowerCase().includes(data.nome.toLowerCase())) return;
    setPrompt(atual ? `${atual}\n\nOcasião: ${data.nome}.` : `${data.pedido}.`);
    setSugestao(null);
    setErroMelhoria(null);
  }

  function aprovarSugestao() {
    if (!sugestao?.briefing) return;
    // Numa segunda aprovação, "voltar" continua levando ao texto do operador.
    setTextoAntes((antes) => antes ?? prompt);
    setPrompt(sugestao.briefing);
    setSugestao(null);
  }

  function desfazerAprovacao() {
    if (textoAntes === null) return;
    setPrompt(textoAntes);
    setTextoAntes(null);
  }

  async function enviar(audio?: Blob, forcarSemSaldo = false) {
    setEnviando(true);
    setErro(null);
    try {
      let res: Response;
      if (audio) {
        const form = new FormData();
        form.append("clienteId", clienteId);
        form.append("audio", audio, "pedido.webm");
        form.append("quantidade", String(quantidade));
        form.append("formato", formato);
        form.append("estilo", estilo);
        form.append("intensidade", intensidade);
        form.append("tipoImagem", tipoImagem);
        if (forcarSemSaldo) form.append("forcarSemSaldo", "true");
        if (produtoRefId) form.append("produtoRefId", produtoRefId);
        if (arteBaseUrl) {
          form.append("arteBaseUrl", arteBaseUrl);
          form.append("modoTransformacao", modoTransformacao);
        }
        res = await fetch("/api/geracoes/criar", { method: "POST", body: form });
      } else {
        res = await fetch("/api/geracoes/criar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clienteId,
            prompt,
            quantidade,
            formato,
            estilo,
            intensidade,
            tipoImagem,
            forcarSemSaldo,
            ...(produtoRefId ? { produtoRefId } : {}),
            ...(arteBaseUrl ? { arteBaseUrl, modoTransformacao } : {}),
          }),
        });
      }

      const json = await lerRespostaJSON<{
        error?: string;
        pedidoId?: string;
        saldoInsuficiente?: boolean;
        podeForcar?: boolean;
        transcricao?: string;
      }>(res);

      if (!res.ok || !json.pedidoId) {
        if (json.saldoInsuficiente) {
          if (json.transcricao) setPrompt(json.transcricao);
          setPodeForcar(Boolean(json.podeForcar));
          setErro(json.error ?? "Saldo insuficiente.");
          return;
        }
        throw new Error(json.error ?? "Erro ao iniciar a geração.");
      }

      router.push(`/pedidos/${json.pedidoId}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao iniciar a geração.");
    } finally {
      setEnviando(false);
      setTranscrevendo(false);
    }
  }

  if (transcrevendo || (enviando && !erro)) {
    return (
      <div className="card flex items-center justify-center px-6 py-24 text-sm">
        <GerandoMensagem
          mensagens={[
            "Ouvindo seu pedido…",
            "Lendo o perfil do cliente…",
            "Montando a direção de arte…",
            "Enviando para a fila…",
          ]}
        />
      </div>
    );
  }

  const custoEmImagens = quantidade;
  const faltaSaldo = custoEmImagens > saldoDisponivel;
  const bloqueadoSemSaldo = faltaSaldo && !ehSocio;
  const semIdentidade = materiais.some((m) => m.tipo === "identidade" && !m.tem);
  const proporcao = FORMATOS.find((f) => f.valor === formato)?.proporcao;
  const aprovacaoPendente = Boolean(sugestao?.briefing);
  const palavras = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
  // Melhorar ou recriar parte da arte enviada. Como referência, ela só ajuda o pedido.
  const trabalhaSobreArte = Boolean(arteBaseUrl) && modoTransformacao !== "referencia";
  // Sobre a arte a informação da campanha vem dela, que a melhoria não enxerga.
  const ideiaCurta =
    !trabalhaSobreArte && !sugestao && textoAntes === null && palavras > 0 && palavras < PALAVRAS_DE_IDEIA_CURTA;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <section className="card p-5 flex flex-col gap-3">
          <TituloCard
            titulo="O que você precisa?"
            descricao="Escreva ou fale do seu jeito. O agente lê a identidade visual, o nicho e os materiais deste cliente antes de criar."
          />

          {repetir && (
            <p className="text-[13px] text-[var(--muted)]">
              Repetindo o pedido “{repetir.titulo}”, com os mesmos controles. Mude o que quiser antes de gerar.
            </p>
          )}

          <textarea
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              // A sugestão foi feita sobre o texto anterior: aprová-la agora
              // apagaria o que o operador acabou de escrever.
              setSugestao(null);
              setErroMelhoria(null);
            }}
            className="input min-h-[132px] max-h-[50vh] resize-y field-sizing-content"
            placeholder="Ex: promoção de hambúrguer artesanal no combo com fritas e refri por R$39,90, hoje só até as 22h"
            disabled={gravando || melhorando}
          />

          <div className="flex flex-wrap items-center gap-2">
            {gravando ? (
              <>
                <button type="button" onClick={() => pararGravacao("gerar")} className="btn btn-accent">
                  <Square size={14} aria-hidden="true" />
                  Parar e usar o áudio
                </button>
                {!trabalhaSobreArte && (
                  <button type="button" onClick={() => pararGravacao("melhorar")} className="btn btn-outline">
                    <WandSparkles size={16} aria-hidden="true" />
                    Parar e melhorar a ideia
                  </button>
                )}
                <span className="text-sm text-[var(--muted)]">Gravando…</span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={iniciarGravacao}
                  disabled={bloqueadoSemSaldo || melhorando}
                  className="btn btn-outline"
                >
                  <Mic size={16} aria-hidden="true" />
                  Gravar áudio
                </button>
                {!trabalhaSobreArte && (
                  <button
                    type="button"
                    onClick={() => melhorar()}
                    disabled={!prompt.trim() || melhorando || bloqueadoSemSaldo}
                    className={`btn btn-outline ${ideiaCurta ? "border-[var(--accent)] text-[var(--accent)]" : ""}`}
                  >
                    {melhorando ? (
                      <span className="spinner" aria-hidden="true" />
                    ) : (
                      <WandSparkles size={16} aria-hidden="true" />
                    )}
                    {melhorando ? "Melhorando…" : "Melhorar minha ideia"}
                  </button>
                )}
                {ideiaCurta && !melhorando && (
                  <span className="text-[13px] text-[var(--muted)]">Ideia curta: a IA pode montar um briefing melhor.</span>
                )}
              </>
            )}
          </div>

          {datas.length > 0 && !gravando && !trabalhaSobreArte && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-[var(--muted)]">Datas que vêm aí</span>
              {datas.map((d) => (
                <button
                  key={d.nome}
                  type="button"
                  onClick={() => usarData(d)}
                  disabled={melhorando}
                  title={d.doRamo ? "Data do ramo deste cliente" : "Data do comércio"}
                  className="chip"
                >
                  {d.nome} <span className="opacity-60">{d.quando}</span>
                </button>
              ))}
            </div>
          )}

          {erroMelhoria && <p className="text-sm text-[var(--danger)]">{erroMelhoria}</p>}

          {textoAntes !== null && (
            <p className="text-[13px] text-[var(--muted)]">
              Briefing aprovado.{" "}
              <button type="button" onClick={desfazerAprovacao} className="underline hover:text-[var(--foreground)]">
                Voltar ao meu texto
              </button>
            </p>
          )}

          {sugestao && (
            <div ref={sugestaoRef} className="quadro p-4 flex flex-col gap-3 scroll-mt-20 scroll-mb-24 lg:scroll-mb-4">
              {sugestao.briefing ? (
                <div className="flex flex-col gap-1.5">
                  <span className="label mb-0">Briefing sugerido</span>
                  <p className="text-sm whitespace-pre-wrap">{sugestao.briefing}</p>
                </div>
              ) : (
                <p className="text-sm">Sua ideia já está boa. Pode gerar assim.</p>
              )}

              {sugestao.faltou.length > 0 && (
                <p className="text-[13px] text-[var(--muted)]">Para ficar mais forte, informe: {sugestao.faltou.join("; ")}.</p>
              )}
              {sugestao.avisos.map((aviso) => (
                <p key={aviso} className="text-[13px] text-[var(--danger)]">
                  Confira. {aviso}
                </p>
              ))}

              <div className="flex flex-wrap items-center gap-2">
                {sugestao.briefing && (
                  <>
                    <button type="button" onClick={aprovarSugestao} disabled={melhorando} className="btn btn-primary btn-sm">
                      <Check size={14} aria-hidden="true" />
                      Aprovar briefing
                    </button>
                    <button type="button" onClick={() => melhorar()} disabled={melhorando} className="btn btn-outline btn-sm">
                      Outra sugestão
                    </button>
                  </>
                )}
                <button type="button" onClick={() => setSugestao(null)} disabled={melhorando} className="btn btn-ghost btn-sm">
                  {sugestao.briefing ? "Manter meu texto" : "Fechar"}
                </button>
              </div>
            </div>
          )}
        </section>

        <div className={`grid grid-cols-1 gap-4 ${fotosProduto.length > 0 ? "lg:grid-cols-2" : ""}`}>
          {/* Opcional e recolhido no visual, porque a maioria das gerações é do zero.
              É por aqui que entra uma inspiração para o pedido, ou a peça antiga
              quando o cliente pede "melhora essa aí". */}
          <section className="card p-5 flex flex-col gap-3 min-w-0">
            <TituloCard titulo="Enviar uma imagem" descricao="Opcional. Uma referência para o pedido, ou a peça antiga do cliente." />

            {arteBaseUrl ? (
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={arteBaseUrl} alt="Imagem enviada" className="w-20 rounded-lg shrink-0" />
                <div className="flex flex-col gap-2 flex-1 min-w-0">
                  <div className="flex flex-wrap gap-2">
                    {MODOS_DA_IMAGEM.map((m) => (
                      <Opcao key={m.valor} ativo={modoTransformacao === m.valor} onClick={() => setModoTransformacao(m.valor)}>
                        {m.label}
                      </Opcao>
                    ))}
                  </div>
                  <p className="text-[13px] text-[var(--muted)]">
                    {MODOS_DA_IMAGEM.find((m) => m.valor === modoTransformacao)?.ajuda}
                  </p>
                  <button
                    type="button"
                    onClick={() => setArteBaseUrl(null)}
                    className="text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] underline self-start"
                  >
                    Remover imagem
                  </button>
                </div>
              </div>
            ) : (
              <>
                <input
                  type="file"
                  accept="image/*"
                  id="arte-base"
                  className="hidden"
                  disabled={subindoArte}
                  onChange={async (e) => {
                    const arquivo = e.target.files?.[0];
                    if (!arquivo) return;
                    setSubindoArte(true);
                    setErro(null);
                    try {
                      setArteBaseUrl(await enviarImagemParaStorage(arquivo, `artes-base/${clienteId}`));
                    } catch (err) {
                      setErro(err instanceof Error ? err.message : "Falha ao enviar a arte.");
                    } finally {
                      setSubindoArte(false);
                      e.target.value = "";
                    }
                  }}
                />
                <label
                  htmlFor="arte-base"
                  className={`flex items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-5 text-sm font-medium cursor-pointer hover:bg-[var(--surface-muted)] transition-colors ${
                    subindoArte ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  {subindoArte ? (
                    <span className="spinner" aria-hidden="true" />
                  ) : (
                    <ImagePlus size={16} className="text-[var(--muted)]" aria-hidden="true" />
                  )}
                  {subindoArte ? "Enviando…" : "Enviar imagem"}
                </label>
              </>
            )}
          </section>

          {fotosProduto.length > 0 && (
            <section className="card p-5 flex flex-col gap-3 min-w-0">
              <TituloCard
                titulo="Foto do produto"
                descricao={`A foto escolhida vira o produto da arte. ${
                  trabalhaSobreArte ? "Sem foto, vale o produto da arte enviada." : "Sem foto, a IA compõe o produto do pedido."
                }`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Opcao ativo={produtoRefId === null} onClick={() => setProdutoRefId(null)}>
                  Nenhuma
                </Opcao>
                {fotosProduto.map((foto) => (
                  <button
                    key={foto.id}
                    type="button"
                    onClick={() => setProdutoRefId(foto.id)}
                    title={foto.descricao ?? "Foto do produto"}
                    aria-pressed={produtoRefId === foto.id}
                    className={`rounded-[10px] overflow-hidden border-2 ${
                      produtoRefId === foto.id ? "border-[var(--foreground)]" : "border-transparent"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foto.url} alt={foto.descricao ?? "Foto do produto"} className="w-14 h-14 object-cover" />
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <section className="card p-5 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
          <div className="lg:col-span-2 flex flex-col gap-2">
            <Grupo titulo="Tipo de imagem">
              {TIPOS_IMAGEM.map((t) => (
                <Opcao key={t.valor} ativo={tipoImagem === t.valor} onClick={() => setTipoImagem(t.valor)}>
                  {t.label}
                </Opcao>
              ))}
            </Grupo>
            <p className="text-[13px] text-[var(--muted)]">
              {TIPOS_IMAGEM.find((t) => t.valor === tipoImagem)?.ajuda ||
                "A IA escolhe pelo pedido: se ele pedir ilustração ou flyer gráfico, a arte segue."}
            </p>
          </div>

          <Grupo titulo="Estilo visual">
            {ESTILOS.map((e) => (
              <Opcao key={e.valor} ativo={estilo === e.valor} onClick={() => setEstilo(e.valor)}>
                {e.label}
              </Opcao>
            ))}
          </Grupo>

          <Grupo titulo="Impacto visual">
            {INTENSIDADES.map((i) => (
              <Opcao key={i.valor} ativo={intensidade === i.valor} onClick={() => setIntensidade(i.valor)}>
                {i.label}
              </Opcao>
            ))}
          </Grupo>
        </section>
      </div>

      {/* Coluna fixa: o botão de gerar e o que ele vai gastar ficam sempre à vista,
          por mais que o operador role o formulário. */}
      <aside className="card p-5 flex flex-col gap-5 xl:sticky xl:top-6">
        <Grupo titulo="Quantas imagens">
          {QUANTIDADES.map((q) => (
            <Opcao key={q} ativo={quantidade === q} onClick={() => setQuantidade(q)}>
              {q}
            </Opcao>
          ))}
        </Grupo>

        <Grupo titulo="Formato">
          {FORMATOS.map((f) => (
            <Opcao key={f.valor} ativo={formato === f.valor} onClick={() => setFormato(f.valor)}>
              {f.label} <span className="opacity-60">{f.ajuda}</span>
            </Opcao>
          ))}
        </Grupo>

        {/* Prévia do que vai sair: quantas peças e em que proporção. Some em janela
            baixa, senão empurra o botão de gerar para fora da tela. */}
        <div
          className="quadro flex items-center justify-center gap-2 h-32 px-3 [@media(max-height:820px)]:hidden"
          aria-hidden="true"
        >
          {Array.from({ length: quantidade }, (_, i) => (
            <span
              key={i}
              className="h-20 rounded-md border border-[var(--border-strong)] bg-[var(--surface)]"
              style={{ aspectRatio: proporcao }}
            />
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-4">
          <span className="label mb-0.5">O agente vai usar</span>
          <ul className="flex flex-col gap-1.5">
            {materiais.map((m) => (
              <li
                key={m.tipo}
                className={`flex items-center gap-2 text-[13px] ${m.tem ? "" : "text-[var(--muted)]"}`}
                title={m.tem ? "Disponível" : "Não cadastrado"}
              >
                {m.tem ? (
                  <Check size={14} className="text-[var(--success)] shrink-0" aria-hidden="true" />
                ) : (
                  <Minus size={14} className="shrink-0" aria-hidden="true" />
                )}
                {m.label}
              </li>
            ))}
          </ul>
          {semIdentidade && (
            <p className="text-xs text-[var(--muted)] mt-1">
              Sem identidade cadastrada as artes saem genéricas.{" "}
              <Link href={`/clientes/${clienteId}#identidade`} className="underline">
                Preencher
              </Link>{" "}
              leva um minuto e muda bastante o resultado.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-[var(--border)] pt-4">
          <p className="flex items-center justify-between gap-2 text-[13px] text-[var(--muted)]">
            <span>Consome {custoEmImagens} do pacote</span>
            <span className={faltaSaldo ? "text-[var(--danger)] font-medium" : ""}>Saldo: {saldoDisponivel}</span>
          </p>

          {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

          {/* Com sugestão aberta o botão espera: gerar agora usaria o texto antigo
              e gastaria o pacote em algo que o operador talvez nem queira mais. */}
          <button
            type="button"
            onClick={() => enviar()}
            disabled={
              (!prompt.trim() && !trabalhaSobreArte) || enviando || gravando || melhorando || aprovacaoPendente || bloqueadoSemSaldo
            }
            className="btn btn-ia btn-block"
          >
            <Sparkles size={16} aria-hidden="true" />
            {aprovacaoPendente ? "Aprove ou descarte a sugestão" : `Gerar ${quantidade > 1 ? `${quantidade} imagens` : "imagem"}`}
          </button>

          {/* Produzir sem saldo é decisão comercial: fica só com o sócio. */}
          {podeForcar && ehSocio && (
            <button
              type="button"
              onClick={() => enviar(undefined, true)}
              disabled={enviando || melhorando || aprovacaoPendente}
              className="btn btn-outline btn-block"
            >
              Gerar mesmo sem saldo
            </button>
          )}

          {bloqueadoSemSaldo && (
            <p className="text-xs text-[var(--muted)]">
              {planoVencidoEm
                ? `O plano deste cliente venceu em ${formatarDia(planoVencidoEm)}. Peça a um sócio para renovar.`
                : "Este cliente não tem saldo suficiente. Peça a um sócio para lançar o pacote."}
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="label mb-0">{titulo}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Opcao({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo} className={ativo ? "chip chip-selected" : "chip"}>
      {children}
    </button>
  );
}
