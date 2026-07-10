"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { lerRespostaJSON } from "@/lib/fetch-json";
import {
  CAMPOS_CONDICIONAIS_PRINCIPAL,
  CARD_BRIEFING_PRINCIPAL,
  formatarConteudoComposicao,
  selecoesCardPrincipalParaBriefing,
  selecoesCardSegmentoParaPerguntas,
} from "@/lib/briefing-card";
import CardAgrupado from "@/components/CardAgrupado";
import CardBoundary from "@/components/CardBoundary";
import CardFallback from "@/components/CardFallback";
import GerandoMensagem from "@/components/GerandoMensagem";
import MaterialsPanel from "@/components/MaterialsPanel";
import MaterialsStep from "@/components/MaterialsStep";
import type {
  BriefingCompleto,
  ContratoAgente,
  ImagemAnexo,
  MensagemChat,
  ModoUsoConteudo,
  TipoImagemAnexo,
} from "@/lib/types";

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

// Etapas fixas do fluxo rápido de criação (controladas pelo app, não pelo
// modelo — ver agente-conversa.ts). "materiais", "card_principal" e
// "conteudo" nunca chamam a IA sozinhos — só quando "conteudo" é enviado é
// que a primeira mensagem consolidada (objetivo/formato/estilo/cores +
// conteúdo) vai pro modelo, decidindo o bloco de segmento.
type Fase = "conversa" | "materiais" | "card_principal" | "conteudo" | "card_segmento" | "observacao";

// Primeira pergunta é fixa (não gasta chamada à IA) — já entra no formato do
// contrato do agente pra manter o histórico consistente (ver agente-conversa.ts).
// A conversa começa entendendo o produto (aberto), não escolhendo categoria.
function contratoInicial(): ContratoAgente {
  return {
    mensagem: "Oi! Vou te ajudar a montar sua arte. Pra começar: o que você quer anunciar hoje?",
    opcoes: [],
    grupos: [],
    campoEmColeta: "descricaoProduto",
    briefingParcial: {},
    prontoParaGerar: false,
    acaoSugerida: "continuar_conversa",
  };
}

// Reconhecimento gerado pelo próprio front (sem chamar a IA) pra etapas
// puramente locais — materiais adicionados, por exemplo — mantendo o
// mesmo formato de mensagem da transcrição.
function contratoReconhecimento(mensagem: string): ContratoAgente {
  return {
    mensagem,
    opcoes: [],
    grupos: [],
    campoEmColeta: null,
    briefingParcial: {},
    prontoParaGerar: false,
    acaoSugerida: "continuar_conversa",
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
      return n > 1 ? `Enviei ${n} referências de cores/estilo.` : "Enviei uma referência de cores/estilo.";
    case "logotipo":
      return "Enviei a logo da marca.";
  }
}

export default function ChatWizard() {
  const router = useRouter();
  const supabase = createClient();
  const fimRef = useRef<HTMLDivElement>(null);

  const [mensagens, setMensagens] = useState<MensagemChat[]>(() => [
    { role: "assistant", content: JSON.stringify(contratoInicial()) },
  ]);
  const [fase, setFase] = useState<Fase>("conversa");
  // Campos definidos diretamente pelas escolhas do lojista nos cards e na
  // observação — nunca dependem do modelo ecoar corretamente um JSON, só
  // são mesclados com briefingParcial (extração/composição da IA) na hora
  // de gerar (ver gerar()).
  const [briefingFront, setBriefingFront] = useState<Partial<BriefingCompleto>>({});
  const [respostasCardPrincipal, setRespostasCardPrincipal] = useState("");
  const [conteudoTexto, setConteudoTexto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviandoTipo, setEnviandoTipo] = useState<TipoImagemAnexo | null>(null);
  const [imagens, setImagens] = useState<ImagemAnexo[]>([]);
  const [painelAberto, setPainelAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ultimaAssistente = [...mensagens].reverse().find((m) => m.role === "assistant");
  const contrato = ultimaAssistente ? parseContrato(ultimaAssistente.content) : null;
  const temOpcoes = !!contrato?.opcoes?.length;
  const jaTeveMensagemUsuario = mensagens.some((m) => m.role === "user");

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, gerando, fase]);

  async function enviarMensagem(conteudo: string, aoReceberResposta?: (c: ContratoAgente) => void) {
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
      const json = await lerRespostaJSON<ContratoAgente | { error: string }>(res);
      if (!res.ok || "error" in json) {
        throw new Error("error" in json ? json.error : "Erro na conversa.");
      }
      setMensagens([...novas, { role: "assistant", content: JSON.stringify(json) }]);
      aoReceberResposta?.(json);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não consegui responder agora. Tente de novo.");
    } finally {
      setEnviando(false);
    }
  }

  // Primeira mensagem livre ("o que você quer anunciar?") sempre avança pra
  // etapa de materiais — depois disso, a conversa livre volta a ser só o
  // resumo/confirmação (ou "quero mudar algo"), sem forçar fase.
  function onEnviarTextoLivre(conteudo: string) {
    if (jaTeveMensagemUsuario) {
      enviarMensagem(conteudo);
    } else {
      enviarMensagem(conteudo, () => setFase("materiais"));
    }
  }

  // Etapa de materiais não chama a IA — só reconhece (localmente) o que foi
  // anexado e segue pro card principal. Isso também garante que a conversa
  // nunca vai repetir "você pode enviar materiais" depois desse ponto.
  function onContinuarMateriais() {
    const partes: string[] = [];
    if (imagens.some((i) => i.tipo === "produto")) partes.push("a foto do produto");
    if (imagens.some((i) => i.tipo === "logotipo")) partes.push("a logo da marca");
    if (imagens.some((i) => i.tipo === "referencia")) partes.push("a referência de cores/estilo");
    const texto =
      partes.length > 0
        ? `Perfeito, vou considerar ${partes.join(", ")} na arte.`
        : "Sem problema, vou seguir só com as informações do briefing.";
    setMensagens((prev) => [...prev, { role: "assistant", content: JSON.stringify(contratoReconhecimento(texto)) }]);
    setFase("card_principal");
  }

  // Card principal (objetivo/formato/estilo/cores) também não chama a IA —
  // só guarda as respostas localmente e segue pra etapa de conteúdo, que é
  // quem consolida tudo numa única mensagem pro modelo.
  function onEnviarCardPrincipal(texto: string, selecoes: Record<string, string>, camposTexto: Record<string, string>) {
    setBriefingFront((prev) => ({ ...prev, ...selecoesCardPrincipalParaBriefing(selecoes, camposTexto) }));
    setRespostasCardPrincipal(texto);
    setFase("conteudo");
  }

  function onEnviarConteudo(modo: ModoUsoConteudo) {
    const textoUsuario = conteudoTexto.trim();
    if (!textoUsuario) return;
    const linha = formatarConteudoComposicao(modo, textoUsuario);
    const mensagemConsolidada = `${respostasCardPrincipal}\n${linha}`;
    enviarMensagem(mensagemConsolidada, (c) => setFase(c.grupos.length > 0 ? "card_segmento" : "observacao"));
  }

  function onEnviarCardSegmento(texto: string, selecoes: Record<string, string>) {
    const gruposAtuais = contrato?.grupos ?? [];
    setBriefingFront((prev) => ({
      ...prev,
      perguntasSegmento: [...(prev.perguntasSegmento ?? []), ...selecoesCardSegmentoParaPerguntas(gruposAtuais, selecoes)],
    }));
    enviarMensagem(texto, () => setFase("observacao"));
  }

  function onContinuarObservacao() {
    if (enviando) return;
    const texto = observacao.trim() || "Sem observação adicional.";
    setBriefingFront((prev) => ({ ...prev, observacaoUsuario: observacao.trim() || undefined }));
    enviarMensagem(texto, () => setFase("conversa"));
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
      // Só registra o envio na transcrição se a conversa já estiver em modo
      // livre — durante a etapa de materiais e os cards agrupados isso viraria
      // uma mensagem de usuário fora de ordem, sem afetar a etapa em andamento
      // (a etapa de materiais já reconhece tudo de uma vez ao continuar).
      if (fase === "conversa") await enviarMensagem(mensagemEnvio(tipo, novas.length));
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Falha ao enviar a imagem.");
    } finally {
      setEnviandoTipo(null);
      e.target.value = "";
    }
  }

  function removerImagem(index: number) {
    setImagens((prev) => prev.filter((_, i) => i !== index));
  }

  async function gerar() {
    if (!contrato?.prontoParaGerar) return;
    setGerando(true);
    setErro(null);
    try {
      // A verdade sobre quais anexos existem vem do que foi de fato enviado
      // (painel/etapa de materiais), não do que a conversa acha que existe. Os
      // campos do card agrupado (briefingFront) têm prioridade sobre o que o
      // modelo ecoou em briefingParcial — nunca dependem da IA acertar a
      // transcrição de objetivo/formato/estilo/cores.
      const briefing: BriefingCompleto = {
        ...(contrato.briefingParcial as BriefingCompleto),
        ...briefingFront,
        temFotoProduto: imagens.some((i) => i.tipo === "produto"),
        temReferencia: imagens.some((i) => i.tipo === "referencia"),
        temLogotipo: imagens.some((i) => i.tipo === "logotipo"),
      };
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagens, briefing, mensagens }),
      });
      const json = await lerRespostaJSON<{ error?: string; projectId?: string }>(res);
      if (!res.ok || !json.projectId) throw new Error(json.error ?? "Erro ao gerar.");
      router.push(`/resultado/${json.projectId}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao gerar a arte.");
      setGerando(false);
    }
  }

  const totalAnexos = imagens.length;

  return (
    <div className="flex flex-col flex-1 min-h-0 relative">
      {/* Cabeçalho leve com acesso a "Materiais da arte" — sempre
          disponível (acesso discreto), o destaque principal é a etapa
          contextual que aparece depois da 1ª resposta. */}
      <div className="flex items-center justify-end mb-2">
        <button type="button" onClick={() => setPainelAberto(true)} className="badge cursor-pointer hover:border-[var(--accent)] transition-colors">
          🧩 Materiais da arte {totalAnexos > 0 ? `(${totalAnexos})` : ""}
        </button>
      </div>

      {/* Transcrição + etapa atual — tudo dentro do MESMO container com
          scroll, pra que o auto-scroll sempre revele a etapa ativa (card,
          materiais, observação etc.), mesmo em telas pequenas. */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
        {mensagens.map((m, i) => {
          if (m.role === "user") {
            return (
              <div
                key={i}
                className="self-end max-w-[85%] bg-[var(--primary)] text-[var(--primary-foreground)] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm whitespace-pre-line"
              >
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
          <div className="self-start card px-4 py-2.5 text-sm text-[var(--muted)] flex items-center gap-2">
            <span className="spinner" aria-hidden="true" />
            digitando…
          </div>
        )}

        {erro && <p className="text-sm text-[var(--danger)]">{erro}</p>}

        {/* Botão de gerar — aparece assim que o briefing estiver resolvido,
            mas a conversa continua liberada pra refinar depois. */}
        {contrato?.prontoParaGerar && fase === "conversa" && (
          <button type="button" onClick={gerar} disabled={gerando} className="btn btn-accent btn-block">
            {gerando ? <GerandoMensagem /> : "Gerar minhas artes ✨"}
          </button>
        )}

        {/* Etapa atual — muda de acordo com a fase fixa do fluxo. */}
        {fase === "materiais" ? (
          <MaterialsStep
            imagens={imagens}
            enviandoTipo={enviandoTipo}
            onSelecionarImagens={onSelecionarImagens}
            onRemover={removerImagem}
            onContinuar={onContinuarMateriais}
            enviando={enviando}
          />
        ) : fase === "card_principal" ? (
          <CardBoundary
            fallback={
              <CardFallback
                titulo={CARD_BRIEFING_PRINCIPAL.titulo}
                enviando={enviando}
                onEnviarTexto={(t) => onEnviarCardPrincipal(t, {}, {})}
              />
            }
          >
            <CardAgrupado
              card={CARD_BRIEFING_PRINCIPAL}
              camposCondicionais={CAMPOS_CONDICIONAIS_PRINCIPAL}
              onEnviar={onEnviarCardPrincipal}
              enviando={enviando}
            />
          </CardBoundary>
        ) : fase === "conteudo" ? (
          <div className="card p-4 flex flex-col gap-3">
            <div>
              <h3 className="font-semibold text-sm">O que você quer que apareça na arte?</h3>
              <p className="text-xs text-[var(--muted)] mt-1">
                Escreva do seu jeito. Pode ser produto, preço, promoção, WhatsApp, entrega, frase, endereço ou qualquer informação importante.
              </p>
            </div>
            <textarea
              className="input min-h-[90px] resize-none"
              value={conteudoTexto}
              onChange={(e) => setConteudoTexto(e.target.value)}
              placeholder="Ex: Quarta da costela, costela R$20,99, chamar no WhatsApp e aproveitar enquanto durar o estoque."
              disabled={enviando}
            />
            {conteudoTexto.trim() && (
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => onEnviarConteudo("melhorar_ideia")}
                  disabled={enviando}
                  className="text-left bg-[var(--accent-soft)] px-4 py-3 rounded-xl border border-[var(--accent)]"
                >
                  <p className="font-semibold text-sm">
                    ✨ Melhorar minha ideia <span className="text-xs font-normal text-[var(--accent)]">(recomendado)</span>
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    A IA mantém as informações principais, mas pode criar uma chamada melhor, organizar título, apoio, preço e CTA para vender mais.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => onEnviarConteudo("usar_exatamente")}
                  disabled={enviando}
                  className="text-left bg-[var(--surface-muted)] px-4 py-3 rounded-xl"
                >
                  <p className="font-semibold text-sm">Usar exatamente como escrevi</p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    A IA organiza visualmente o que você escreveu, sem mudar frases, nomes, preços ou informações.
                  </p>
                </button>
              </div>
            )}
          </div>
        ) : fase === "card_segmento" && contrato?.grupos?.length ? (
          <CardBoundary
            fallback={
              <CardFallback
                titulo={contrato.mensagem}
                enviando={enviando}
                onEnviarTexto={(t) => onEnviarCardSegmento(t, {})}
              />
            }
          >
            <CardAgrupado
              card={{ titulo: contrato.mensagem, grupos: contrato.grupos, botaoEnviar: "Enviar respostas" }}
              onEnviar={onEnviarCardSegmento}
              enviando={enviando}
            />
          </CardBoundary>
        ) : fase === "observacao" ? (
          <div className="card p-4 flex flex-col gap-3">
            <div>
              <h3 className="font-semibold text-sm">Quer acrescentar alguma observação?</h3>
              <p className="text-xs text-[var(--muted)] mt-1">
                Ex: evitar fundo escuro, destacar preço, deixar mais jovem, seguir estilo do Instagram da loja...
              </p>
            </div>
            <textarea
              className="input min-h-[70px] resize-none"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Opcional — pode deixar em branco e continuar"
              disabled={enviando}
            />
            <button type="button" onClick={onContinuarObservacao} disabled={enviando} className="btn btn-accent btn-block">
              {enviando ? "Continuando…" : "Continuar"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {temOpcoes && (
              <div className="flex flex-wrap gap-2">
                {contrato!.opcoes.map((o) => (
                  <button key={o} type="button" onClick={() => enviarMensagem(o)} disabled={enviando || gerando} className="chip">
                    {o}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onEnviarTextoLivre(texto);
              }}
              className="flex gap-2"
            >
              <input
                className="input flex-1"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={temOpcoes ? "Ou descreva com suas palavras…" : "Digite sua resposta…"}
                disabled={enviando || gerando}
              />
              <button type="submit" disabled={!texto.trim() || enviando || gerando} className="btn btn-primary">
                Enviar
              </button>
            </form>
          </div>
        )}

        <div ref={fimRef} />
      </div>

      {/* Painel lateral "Materiais da arte" — acesso discreto sempre
          disponível, mesmo depois da etapa contextual já ter passado.
          Nenhum material é obrigatório para gerar. */}
      {painelAberto && (
        <div className="fixed inset-0 z-20 flex justify-end">
          <div className="absolute inset-0 bg-black/40 panel-backdrop" onClick={() => setPainelAberto(false)} />
          <div className="relative w-[85%] max-w-sm h-full bg-[var(--background)] shadow-xl flex flex-col p-4 overflow-y-auto panel-sheet">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Materiais da arte</h2>
              <button
                type="button"
                onClick={() => setPainelAberto(false)}
                aria-label="Fechar painel de materiais da arte"
                className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Fechar
              </button>
            </div>
            <p className="text-xs text-[var(--muted)] mb-4">
              Envie fotos, logo ou referências para deixar a arte mais fiel à sua marca.
            </p>
            <MaterialsPanel
              imagens={imagens}
              enviandoTipo={enviandoTipo}
              onSelecionarImagens={onSelecionarImagens}
              onRemover={removerImagem}
            />
          </div>
        </div>
      )}
    </div>
  );
}
