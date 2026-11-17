"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, ImagePlus, Mic, RotateCcw, Sparkles, Square, TriangleAlert, X } from "lucide-react";
import { cadastrarComIA } from "@/app/(app)/clientes/actions";
import { erroDoPlano } from "@/components/CamposPlano";
import ComoEntra, { type ModoCadastro } from "@/components/ComoEntra";
import Modal from "@/components/Modal";
import { CabecalhoPagina } from "@/components/ui";
import { enviarImagemParaStorage } from "@/lib/upload-storage";
import { promessasEm } from "@/lib/agencia/promessas";
import {
  CAMPOS_FICHA,
  FICHA_VAZIA,
  LIMITE_CAMPO,
  MAX_ANEXOS,
  ROTULO_MATERIAL,
  fichaValida,
  sessaoValida,
  tipoMaterialValido,
  type AnexoCadastro,
  type CampoFicha,
  type FichaCadastro,
  type MensagemCadastro,
  type RespostaCadastro,
  type TipoMaterial,
} from "@/lib/agencia/cadastro-ia";

// Cadastro de cliente conversando com a IA. O sócio conta da empresa, por texto ou
// áudio, e manda imagens; a IA preenche a ficha ao lado e pergunta o que falta. Tudo
// fica neste navegador até o clique em cadastrar: fechar a aba não perde a conversa.

interface Rascunho {
  sessao: string;
  mensagens: MensagemCadastro[];
  ficha: FichaCadastro;
  // Campos que o sócio editou à mão: a IA só muda se ele pedir.
  editados: CampoFicha[];
  anexos: AnexoCadastro[];
  // Número da próxima imagem. Não volta atrás, para "imagem 3" ser sempre a mesma.
  proximo: number;
  faltando: string[];
}

// Imagem escolhida e ainda não mandada para a IA.
interface Pendente {
  id: string;
  previa: string;
  url?: string;
  enviando: boolean;
  falhou?: string;
}

const RASCUNHO_VAZIO: Rascunho = {
  sessao: "",
  mensagens: [],
  ficha: FICHA_VAZIA,
  editados: [],
  anexos: [],
  proximo: 1,
  faltando: [],
};

const CHAVE_RASCUNHO = "cadastro-ia:rascunho:v1";
const TIPOS_ACEITOS = ["image/png", "image/jpeg", "image/webp"];
const TIPOS_MATERIAL: TipoMaterial[] = [
  "logo",
  "arte_aprovada",
  "produto",
  "referencia_visual",
  "logo_parceiro",
  "descartar",
];

interface DefCampo {
  campo: CampoFicha;
  rotulo: string;
  linhas?: number;
  largo?: boolean;
  dica?: string;
}

const SECOES: { titulo: string; campos: DefCampo[] }[] = [
  {
    titulo: "Empresa",
    campos: [
      { campo: "nome", rotulo: "Nome da empresa *" },
      { campo: "nicho", rotulo: "Ramo", dica: "Ex: autoescola" },
      {
        campo: "sobre",
        rotulo: "Sobre a empresa",
        linhas: 3,
        largo: true,
        dica: "O que ela faz, para quem e como a pessoa compra",
      },
      { campo: "contato_nome", rotulo: "Contato" },
      { campo: "contato_telefone", rotulo: "Telefone do contato" },
    ],
  },
  {
    titulo: "Identidade",
    campos: [
      { campo: "cores_primarias", rotulo: "Cores primárias", largo: true, dica: "Ex: azul-marinho #1B2A4A e amarelo #F5C400" },
      { campo: "cores_secundarias", rotulo: "Cores secundárias", largo: true },
      {
        campo: "tipografia",
        rotulo: "Tipografia (estilo, não fonte)",
        linhas: 2,
        largo: true,
        dica: "Cada arte escolhe a fonte dentro deste estilo",
      },
      { campo: "tom_de_voz", rotulo: "Tom de voz", largo: true },
      { campo: "estilo_visual", rotulo: "Estilo visual", linhas: 2, largo: true },
      { campo: "regras_obrigatorias", rotulo: "Regras obrigatórias (uma por linha)", linhas: 3, largo: true },
      { campo: "regras_proibidas", rotulo: "Proibido (uma por linha)", linhas: 2, largo: true },
    ],
  },
  {
    titulo: "Contato nas artes",
    campos: [
      { campo: "whatsapp", rotulo: "WhatsApp" },
      { campo: "instagram", rotulo: "Instagram" },
      { campo: "endereco", rotulo: "Endereço", largo: true },
      { campo: "horario_funcionamento", rotulo: "Horário", largo: true },
    ],
  },
];

const ORDEM_CAMPOS = SECOES.flatMap((s) => s.campos.map((c) => c.campo));

const ROTULO_CAMPO = Object.fromEntries(
  SECOES.flatMap((s) => s.campos).map((c) => [c.campo, c.rotulo.replace(/ \*$| \(.*\)$/, "")]),
) as Record<CampoFicha, string>;

// localStorage pode não existir (janela anônima, armazenamento bloqueado): aí a
// conversa vale só enquanto a aba estiver aberta.
function lerRascunho(): Rascunho | null {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE_RASCUNHO) ?? "null") as Partial<Rascunho> | null;
    const sessao = sessaoValida(bruto?.sessao);
    if (!bruto || !sessao) return null;
    return {
      sessao,
      mensagens: Array.isArray(bruto.mensagens) ? bruto.mensagens : [],
      ficha: fichaValida(bruto.ficha),
      editados: Array.isArray(bruto.editados)
        ? bruto.editados.filter((c) => CAMPOS_FICHA.includes(c))
        : [],
      anexos: Array.isArray(bruto.anexos) ? bruto.anexos : [],
      proximo: typeof bruto.proximo === "number" && bruto.proximo > 0 ? bruto.proximo : 1,
      faltando: Array.isArray(bruto.faltando) ? bruto.faltando : [],
    };
  } catch {
    return null;
  }
}

function salvarRascunho(r: Rascunho) {
  try {
    localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(r));
  } catch {
    // Sem armazenamento, segue só na memória.
  }
}

function apagarRascunho() {
  try {
    localStorage.removeItem(CHAVE_RASCUNHO);
  } catch {
    // Nada a apagar.
  }
}

function rotuloDoAnexo(id: string): string {
  return id.startsWith("r") ? `Recorte da ${id.slice(1)}` : `Imagem ${id.slice(1)}`;
}

// O Whisper reconhece o formato pela extensão: o Safari grava em mp4.
function nomeDoAudio(tipo: string): string {
  if (tipo.includes("mp4")) return "cadastro.mp4";
  if (tipo.includes("ogg")) return "cadastro.ogg";
  return "cadastro.webm";
}

export default function CadastroComIA({ hoje, precos }: { hoje: string; precos: Record<string, number> }) {
  const router = useRouter();
  const [r, setR] = useState<Rascunho>(RASCUNHO_VAZIO);
  const carregado = r.sessao !== "";
  const [texto, setTexto] = useState("");
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [pensando, setPensando] = useState<false | "texto" | "imagens" | "audio">(false);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recentes, setRecentes] = useState<CampoFicha[]>([]);
  const [aba, setAba] = useState<"conversa" | "ficha">("conversa");
  const [revisando, setRevisando] = useState(false);
  const [modo, setModo] = useState<ModoCadastro>("plano");
  const [erroCadastro, setErroCadastro] = useState<{ texto: string; clienteId?: string } | null>(null);
  const [cadastrando, iniciarCadastro] = useTransition();

  const listaRef = useRef<HTMLDivElement>(null);
  const fichaRef = useRef<HTMLDivElement>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const descartarAudioRef = useRef(false);
  const timerRecentesRef = useRef<number | undefined>(undefined);
  // Cadastrado: o rascunho já foi apagado e não pode voltar ao armazenamento.
  const encerradoRef = useRef(false);
  // O fim da gravação acontece fora do render em que ela começou.
  const enviarRef = useRef<((audio?: Blob) => Promise<void>) | null>(null);
  // A resposta da IA chega depois de outros renders: é por aqui que ela vê a ficha de agora.
  const rascunhoRef = useRef(r);

  useEffect(() => {
    // O armazenamento só existe no navegador: lido depois do mount, para o HTML
    // inicial bater com o do servidor.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setR(lerRascunho() ?? { ...RASCUNHO_VAZIO, sessao: crypto.randomUUID() });
  }, []);

  useEffect(() => {
    if (carregado && !encerradoRef.current) salvarRascunho(r);
  }, [carregado, r]);

  useEffect(() => {
    const lista = listaRef.current;
    if (lista) lista.scrollTop = lista.scrollHeight;
  }, [r.mensagens.length, pensando, aba]);

  useEffect(() => () => window.clearTimeout(timerRecentesRef.current), []);

  // O campo que a IA acabou de mudar pode estar fora da vista: a ficha rola até o
  // primeiro deles, na ordem da tela.
  useEffect(() => {
    const primeiro = ORDEM_CAMPOS.find((c) => recentes.includes(c));
    if (!primeiro) return;
    fichaRef.current
      ?.querySelector(`[data-campo="${primeiro}"]`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [recentes]);

  // ---------- Imagens ----------

  function adicionarArquivos(arquivos: File[]) {
    if (arquivos.length === 0) return;
    setErro(null);
    const aceitos = arquivos.filter((a) => TIPOS_ACEITOS.includes(a.type));
    const vagas = MAX_ANEXOS - r.anexos.length - pendentes.length;
    if (vagas <= 0) {
      setErro(`Cabem ${MAX_ANEXOS} imagens no cadastro. O resto você sobe depois, na página do cliente.`);
      return;
    }
    if (aceitos.length < arquivos.length) setErro("Mande imagem em JPG, PNG ou WebP.");
    else if (aceitos.length > vagas) setErro(`Entraram ${vagas} imagens: cabem ${MAX_ANEXOS} no cadastro.`);

    const lote = aceitos.slice(0, vagas);
    if (lote.length === 0) return;
    const inicio = r.proximo;
    const novos: Pendente[] = lote.map((arquivo, i) => ({
      id: `i${inicio + i}`,
      previa: URL.createObjectURL(arquivo),
      enviando: true,
    }));
    setR((a) => ({ ...a, proximo: inicio + lote.length }));
    setPendentes((p) => [...p, ...novos]);

    novos.forEach((pendente, i) => {
      enviarImagemParaStorage(lote[i], "cadastro-ia")
        .then((url) =>
          setPendentes((lista) => lista.map((p) => (p.id === pendente.id ? { ...p, url, enviando: false } : p))),
        )
        .catch((e: unknown) =>
          setPendentes((lista) =>
            lista.map((p) =>
              p.id === pendente.id
                ? { ...p, enviando: false, falhou: e instanceof Error ? e.message : "Não subiu." }
                : p,
            ),
          ),
        );
    });
  }

  function tirarPendente(id: string) {
    setPendentes((lista) => {
      const sai = lista.find((p) => p.id === id);
      if (sai) URL.revokeObjectURL(sai.previa);
      return lista.filter((p) => p.id !== id);
    });
  }

  // ---------- Conversa ----------

  function aplicar(resposta: RespostaCadastro, mensagemId: string, fichaEnviada: FichaCadastro) {
    // Campo que o sócio mudou enquanto a IA pensava fica como ele deixou: a resposta
    // foi sobre a ficha de antes.
    const atual = rascunhoRef.current.ficha;
    const alteracoes: Partial<FichaCadastro> = Object.fromEntries(
      Object.entries(resposta.alteracoes).filter(([c]) => atual[c as CampoFicha] === fichaEnviada[c as CampoFicha]),
    );
    const alterados = Object.keys(alteracoes) as CampoFicha[];
    const naoAbriram = new Set(resposta.naoAbriram);
    const aviso =
      naoAbriram.size > 0
        ? `\n\n${[...naoAbriram].map(rotuloDoAnexo).join(", ")} não ${naoAbriram.size === 1 ? "abriu" : "abriram"}. Mande de novo se importar.`
        : "";

    setR((a) => {
      const porId = new Map(resposta.materiais.map((m) => [m.id, m]));
      const anexos = a.anexos
        .filter((x) => !naoAbriram.has(x.id))
        .map((x) => {
          const classificado = porId.get(x.id);
          const paleta = resposta.paletas[x.id] ?? x.paleta;
          if (!classificado || x.editado) return { ...x, paleta, nova: false };
          return { ...x, tipo: classificado.tipo, descricao: classificado.descricao, paleta, nova: false };
        });
      const recortes = resposta.novosAnexos.filter((n) => !anexos.some((x) => x.id === n.id));
      return {
        ...a,
        mensagens: [
          ...a.mensagens.map((m) =>
            m.id === mensagemId
              ? {
                  ...m,
                  texto: [m.texto, resposta.transcricao].filter(Boolean).join("\n"),
                  anexos: m.anexos.filter((id) => !naoAbriram.has(id)),
                }
              : m,
          ),
          {
            id: crypto.randomUUID(),
            papel: "ia",
            texto: resposta.resposta + aviso,
            anexos: recortes.map((n) => n.id),
            alterou: alterados.length + recortes.length,
          },
        ],
        ficha: { ...a.ficha, ...alteracoes },
        anexos: [...anexos, ...recortes],
        faltando: resposta.faltando,
      };
    });

    if (alterados.length > 0) {
      setRecentes(alterados);
      window.clearTimeout(timerRecentesRef.current);
      timerRecentesRef.current = window.setTimeout(() => setRecentes([]), 4000);
    }
  }

  async function enviar(audio?: Blob) {
    if (!carregado || pensando) return;
    if (pendentes.some((p) => p.enviando)) {
      setErro("Espere as imagens terminarem de subir.");
      return;
    }
    const prontos = pendentes.filter((p) => p.url);
    const mensagemTexto = texto.trim();
    if (!mensagemTexto && !audio && prontos.length === 0) return;

    const novos: AnexoCadastro[] = prontos.map((p) => ({
      id: p.id,
      url: p.url!,
      tipo: null,
      descricao: "",
      paleta: [],
      nova: true,
      editado: false,
    }));
    const mensagem: MensagemCadastro = {
      id: crypto.randomUUID(),
      papel: "operador",
      texto: mensagemTexto,
      anexos: novos.map((a) => a.id),
      audio: Boolean(audio),
    };
    const base = r;
    const anexosDaRodada = [...base.anexos, ...novos];

    setR({ ...base, mensagens: [...base.mensagens, mensagem], anexos: anexosDaRodada });
    setPendentes((lista) => lista.filter((p) => !prontos.includes(p)));
    setTexto("");
    setErro(null);
    setPensando(audio ? "audio" : novos.length > 0 ? "imagens" : "texto");

    const form = new FormData();
    form.append(
      "dados",
      JSON.stringify({
        sessao: base.sessao,
        mensagem: mensagemTexto,
        mensagens: base.mensagens.slice(-24),
        ficha: base.ficha,
        editados: base.editados,
        anexos: anexosDaRodada,
      }),
    );
    if (audio) form.append("audio", audio, nomeDoAudio(audio.type));

    let resposta: RespostaCadastro | null = null;
    let falha: { texto: string; transcricao?: string } | null = null;
    try {
      const res = await fetch("/api/clientes/cadastro-ia", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as (RespostaCadastro & { error?: string }) | null;
      if (res.ok && json) resposta = json;
      else falha = { texto: json?.error ?? "A IA não respondeu agora. Tente de novo.", transcricao: json?.transcricao };
    } catch {
      falha = { texto: "Sem conexão. Confira a internet e tente de novo." };
    }
    setPensando(false);

    if (!resposta) {
      // Desfaz a rodada: a mensagem volta para a caixa e as imagens para cima dela.
      setR((a) => ({
        ...a,
        mensagens: a.mensagens.filter((m) => m.id !== mensagem.id),
        anexos: a.anexos.filter((x) => !novos.some((n) => n.id === x.id)),
      }));
      setPendentes((lista) => [...prontos, ...lista]);
      setTexto((atual) => [mensagemTexto, falha?.transcricao, atual].filter(Boolean).join("\n"));
      setErro(falha?.texto ?? "A IA não respondeu agora. Tente de novo.");
      return;
    }

    prontos.forEach((p) => URL.revokeObjectURL(p.previa));
    aplicar(resposta, mensagem.id, base.ficha);
  }

  useEffect(() => {
    enviarRef.current = enviar;
    rascunhoRef.current = r;
  });

  async function gravar() {
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      descartarAudioRef.current = false;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        // Libera o microfone na hora, senão o indicador do navegador fica aceso.
        stream.getTracks().forEach((t) => t.stop());
        if (descartarAudioRef.current) return;
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        void enviarRef.current?.(audio);
      };
      recorder.start();
      recorderRef.current = recorder;
      setGravando(true);
    } catch {
      setErro("Não consegui acessar o microfone. Você pode digitar.");
    }
  }

  function pararGravacao(enviarAudio: boolean) {
    descartarAudioRef.current = !enviarAudio;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setGravando(false);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
    // No celular o Enter quebra a linha; envia pelo botão.
    if (window.matchMedia("(pointer: coarse)").matches) return;
    e.preventDefault();
    void enviar();
  }

  function aoColar(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const imagens = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
    if (imagens.length === 0) return;
    if (!e.clipboardData.getData("text/plain")) e.preventDefault();
    adicionarArquivos(imagens);
  }

  // ---------- Ficha ----------

  function mudarCampo(campo: CampoFicha, valor: string) {
    setR((a) => ({
      ...a,
      ficha: { ...a.ficha, [campo]: valor },
      editados: a.editados.includes(campo) ? a.editados : [...a.editados, campo],
    }));
  }

  function mudarTipo(id: string, valor: string) {
    const tipo = tipoMaterialValido(valor);
    if (!tipo) return;
    setR((a) => ({
      ...a,
      anexos: a.anexos.map((x) =>
        x.id === id
          ? {
              ...x,
              tipo,
              editado: true,
              // Na logo de parceiro a descrição é o nome que aciona: começa vazia.
              descricao: tipo === "logo_parceiro" && x.tipo !== "logo_parceiro" ? "" : x.descricao,
            }
          : x,
      ),
    }));
  }

  function mudarNomeParceiro(id: string, nome: string) {
    setR((a) => ({
      ...a,
      anexos: a.anexos.map((x) => (x.id === id ? { ...x, descricao: nome, editado: true } : x)),
    }));
  }

  function recomecar() {
    if (!window.confirm("Apagar a conversa e a ficha e começar de novo?")) return;
    // Áudio pela metade não vai para a conversa nova.
    if (recorderRef.current) pararGravacao(false);
    apagarRascunho();
    pendentes.forEach((p) => URL.revokeObjectURL(p.previa));
    setPendentes([]);
    setTexto("");
    setErro(null);
    setRecentes([]);
    setAba("conversa");
    setR({ ...RASCUNHO_VAZIO, sessao: crypto.randomUUID() });
  }

  const materiais = r.anexos.filter((a) => a.tipo && a.tipo !== "descartar");
  const logos = materiais.filter((a) => a.tipo === "logo");
  const parceiroSemNome = materiais.find((a) => a.tipo === "logo_parceiro" && !a.descricao.trim());
  const subindo = pendentes.some((p) => p.enviando);
  // Conta feita aqui, e não pelo modelo: vale o que está na ficha agora, com a logo
  // recortada e com o que o sócio editou depois da última resposta.
  const pronto =
    logos.length > 0 &&
    (["nome", "nicho", "sobre", "cores_primarias"] as const).every((c) => r.ficha[c].trim());
  const faltando = logos.length > 0 ? r.faltando.filter((f) => !/logo/i.test(f)) : r.faltando;
  const preenchidos = CAMPOS_FICHA.filter((c) => r.ficha[c].trim()).length;
  // Com a IA pensando, a resposta cairia na conversa nova.
  const semRecomecar =
    !carregado || Boolean(pensando) || (r.mensagens.length === 0 && preenchidos === 0 && pendentes.length === 0);
  const promessas = CAMPOS_FICHA.flatMap((c) => {
    const palavras = promessasEm(r.ficha[c]);
    return palavras.length > 0 ? [`“${palavras.join("”, “")}” em ${ROTULO_CAMPO[c]}`] : [];
  });

  function abrirRevisao() {
    setErro(null);
    if (!r.ficha.nome.trim()) {
      setErro("Falta o nome da empresa.");
      setAba("ficha");
      return;
    }
    if (parceiroSemNome) {
      setErro(`Escreva o nome que aciona a logo de parceiro (${rotuloDoAnexo(parceiroSemNome.id)}).`);
      setAba("ficha");
      return;
    }
    setErroCadastro(null);
    setRevisando(true);
  }

  function cadastrar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErroCadastro(null);
    const dados = new FormData(evento.currentTarget);
    const problema = modo === "plano" ? erroDoPlano(dados, hoje) : null;
    if (problema) {
      setErroCadastro({ texto: problema });
      return;
    }
    dados.set("ficha", JSON.stringify(r.ficha));
    dados.set("materiais", JSON.stringify(materiais));
    dados.set("sessao", r.sessao);
    iniciarCadastro(async () => {
      let resultado: Awaited<ReturnType<typeof cadastrarComIA>>;
      try {
        resultado = await cadastrarComIA(dados);
      } catch {
        // Sem isto a falha de rede derrubava a tela inteira. O rascunho continua salvo.
        setErroCadastro({ texto: "Não consegui falar com o servidor. Confira a internet e tente de novo." });
        return;
      }
      if (resultado.id) {
        // O cliente existe: o rascunho não pode virar um segundo cadastro.
        encerradoRef.current = true;
        apagarRascunho();
      }
      if (resultado.erro) {
        setErroCadastro({ texto: resultado.erro, clienteId: resultado.id });
        return;
      }
      if (resultado.id) router.push(`/clientes/${resultado.id}`);
    });
  }

  const textoPensando =
    pensando === "audio" ? "Ouvindo o áudio…" : pensando === "imagens" ? "Olhando as imagens…" : "Pensando…";

  return (
    <>
      <CabecalhoPagina
        titulo="Cadastro com IA"
        voltar={{ href: "/clientes", rotulo: "Clientes" }}
        descricao={
          <>
            Converse e mande imagens: a IA preenche a ficha.{" "}
            <span className="hidden sm:inline">Nada é gravado até você cadastrar.</span>
          </>
        }
        acoes={
          <button
            type="button"
            onClick={recomecar}
            disabled={semRecomecar}
            className="hidden lg:inline-flex btn btn-ghost btn-sm"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Recomeçar
          </button>
        }
      />

      {/* No celular, conversa e ficha dividem a tela em abas, e o recomeçar vai para o
          lado delas: no cabeçalho ele ocupava uma linha inteira. */}
      <div className="lg:hidden flex items-center gap-2 shrink-0">
        <div
          role="tablist"
          aria-label="Cadastro"
          className="flex-1 grid grid-cols-2 gap-0.5 p-0.5 rounded-[10px] bg-[var(--surface-muted)]"
        >
          {(["conversa", "ficha"] as const).map((opcao) => (
            <button
              key={opcao}
              type="button"
              role="tab"
              aria-selected={aba === opcao}
              onClick={() => setAba(opcao)}
              className={`h-9 rounded-lg text-[13px] font-medium transition-colors ${
                aba === opcao
                  ? "bg-[var(--surface)] text-[var(--foreground)] shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {opcao === "conversa" ? "Conversa" : `Ficha · ${preenchidos} de ${CAMPOS_FICHA.length}`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={recomecar}
          disabled={semRecomecar}
          className="btn btn-ghost btn-icone shrink-0"
          aria-label="Recomeçar"
          title="Recomeçar"
        >
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-4">
        {/* ---------- Conversa ---------- */}
        <section
          aria-label="Conversa"
          className={`card min-h-0 flex-col overflow-hidden ${aba === "conversa" ? "flex" : "hidden lg:flex"}`}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes("Files")) e.preventDefault();
          }}
          onDrop={(e) => {
            if (e.dataTransfer.files.length === 0) return;
            e.preventDefault();
            adicionarArquivos([...e.dataTransfer.files]);
          }}
        >
          <div ref={listaRef} role="log" aria-live="polite" className="flex-1 min-h-0 overflow-y-auto px-4 py-4 lg:px-5 flex flex-col gap-4">
            <MensagemDaIA>
              Me conte da empresa: o nome, o que ela vende e para quem. Mande a logo, fotos e artes que ela já postou;
              print do Instagram também ajuda. Pode falar por áudio. Eu preencho a ficha e pergunto o que faltar.
            </MensagemDaIA>

            {r.mensagens.map((m) =>
              m.papel === "ia" ? (
                <MensagemDaIA key={m.id}>
                  {m.texto}
                  {m.anexos.length > 0 && (
                    <Miniaturas ids={m.anexos} anexos={r.anexos} />
                  )}
                  {(m.alterou ?? 0) > 0 && (
                    <button
                      type="button"
                      onClick={() => setAba("ficha")}
                      className="lg:hidden block mt-2 text-[13px] font-medium text-[var(--accent)]"
                    >
                      Ver a ficha
                    </button>
                  )}
                </MensagemDaIA>
              ) : (
                <div key={m.id} className="self-end max-w-[85%] flex flex-col items-end gap-1.5">
                  {m.anexos.length > 0 && <Miniaturas ids={m.anexos} anexos={r.anexos} direita />}
                  {(m.texto || m.audio) && (
                    <div className="rounded-2xl rounded-br-md bg-[var(--surface-muted)] px-3.5 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words">
                      {m.audio && (
                        <span className="flex items-center gap-1 text-[12px] text-[var(--muted)] mb-0.5">
                          <Mic size={12} aria-hidden="true" />
                          Áudio
                        </span>
                      )}
                      {m.texto || "…"}
                    </div>
                  )}
                </div>
              ),
            )}

            {pensando && (
              <p className="flex items-center gap-2 text-[13px] text-[var(--muted)] pl-[38px]">
                <span className="spinner" aria-hidden="true" />
                {textoPensando}
              </p>
            )}
          </div>

          <div className="border-t border-[var(--border)] p-3 flex flex-col gap-2">
            {pendentes.length > 0 && (
              <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Imagens para mandar">
                {pendentes.map((p) => (
                  <li key={p.id} className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.url ?? p.previa}
                      alt={rotuloDoAnexo(p.id)}
                      className={`w-14 h-14 rounded-lg object-cover border ${
                        p.falhou ? "border-[var(--danger)]" : "border-[var(--border)]"
                      } ${p.enviando ? "opacity-50" : ""}`}
                      title={p.falhou ?? rotuloDoAnexo(p.id)}
                    />
                    {p.enviando && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="spinner" aria-label="Subindo" />
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => tirarPendente(p.id)}
                      aria-label={`Tirar ${rotuloDoAnexo(p.id)}`}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--foreground)] text-[var(--background)] flex items-center justify-center"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {erro && (
              <p role="alert" className="text-[13px] text-[var(--danger)]">
                {erro}
              </p>
            )}

            {gravando ? (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-2 text-[13px] text-[var(--muted)] flex-1">
                  <span className="w-2 h-2 rounded-full bg-[var(--danger)] animate-pulse" aria-hidden="true" />
                  Gravando…
                </span>
                <button type="button" onClick={() => pararGravacao(false)} className="btn btn-ghost btn-sm">
                  Cancelar
                </button>
                <button type="button" onClick={() => pararGravacao(true)} className="btn btn-accent btn-sm">
                  <Square size={12} aria-hidden="true" />
                  Enviar áudio
                </button>
              </div>
            ) : (
              <div className="flex items-end gap-1.5">
                <input
                  ref={arquivoRef}
                  type="file"
                  accept={TIPOS_ACEITOS.join(",")}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    adicionarArquivos([...(e.target.files ?? [])]);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => arquivoRef.current?.click()}
                  disabled={!carregado}
                  className="btn btn-ghost btn-icone shrink-0"
                  aria-label="Mandar imagens"
                  title="Mandar imagens"
                >
                  <ImagePlus size={18} aria-hidden="true" />
                </button>
                <textarea
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={aoTeclar}
                  onPaste={aoColar}
                  rows={1}
                  maxLength={4000}
                  aria-label="Mensagem para a IA"
                  placeholder="Conte da empresa"
                  className="input flex-1 min-w-0 max-h-36 resize-none field-sizing-content"
                />
                <button
                  type="button"
                  onClick={gravar}
                  disabled={!carregado || Boolean(pensando)}
                  className="btn btn-ghost btn-icone shrink-0"
                  aria-label="Gravar áudio"
                  title="Gravar áudio"
                >
                  <Mic size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => void enviar()}
                  disabled={
                    !carregado ||
                    Boolean(pensando) ||
                    subindo ||
                    (!texto.trim() && !pendentes.some((p) => p.url))
                  }
                  className="btn btn-primary btn-icone shrink-0"
                  aria-label="Enviar"
                  title="Enviar"
                >
                  <ArrowUp size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ---------- Ficha ---------- */}
        <section
          aria-label="Ficha do cliente"
          className={`card min-h-0 flex-col overflow-hidden ${aba === "ficha" ? "flex" : "hidden lg:flex"}`}
        >
          <div className="px-4 lg:px-5 pt-4 pb-3 border-b border-[var(--border)]">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Ficha do cliente</h2>
            <p className="hidden sm:block text-[13px] text-[var(--muted)] mt-0.5">
              A IA preenche, e você pode mudar qualquer campo. Cores e regras ela cumpre à risca; o resto é norte.
            </p>
          </div>

          <div ref={fichaRef} className="flex-1 min-h-0 overflow-y-auto px-4 lg:px-5 py-4 flex flex-col gap-5">
            {SECOES.map((secao) => (
              <fieldset key={secao.titulo} className="min-w-0">
                <legend className="text-[13px] font-semibold mb-2.5">{secao.titulo}</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
                  {secao.campos.map((def) => (
                    <CampoDaFicha
                      key={def.campo}
                      def={def}
                      valor={r.ficha[def.campo]}
                      recente={recentes.includes(def.campo)}
                      aoMudar={mudarCampo}
                    />
                  ))}
                </div>
              </fieldset>
            ))}

            <fieldset className="min-w-0">
              <legend className="text-[13px] font-semibold mb-2.5">
                Materiais{" "}
                <span className="font-normal text-[var(--muted)]">
                  {r.anexos.length}/{MAX_ANEXOS}
                </span>
              </legend>
              {r.anexos.length === 0 ? (
                <p className="text-[13px] text-[var(--muted)]">
                  As imagens que você mandar na conversa aparecem aqui, com o tipo que a IA escolheu.
                </p>
              ) : (
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {r.anexos.map((a) => (
                    <li
                      key={a.id}
                      className={`quadro p-2 flex flex-col gap-1.5 min-w-0 ${a.tipo === "descartar" ? "opacity-55" : ""}`}
                    >
                      <div className="relative aspect-square rounded-md overflow-hidden bg-[var(--surface)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.url}
                          alt={a.descricao || rotuloDoAnexo(a.id)}
                          title={a.descricao || undefined}
                          className="w-full h-full object-contain"
                        />
                        <span className="badge absolute top-1 left-1 py-0.5 px-1.5 bg-[var(--surface)]/90">
                          {rotuloDoAnexo(a.id)}
                        </span>
                      </div>
                      <select
                        value={a.tipo ?? ""}
                        onChange={(e) => mudarTipo(a.id, e.target.value)}
                        aria-label={`Tipo da ${rotuloDoAnexo(a.id)}`}
                        className="input min-h-8 py-1 px-2 lg:text-[13px]"
                      >
                        {a.tipo === null && <option value="">A IA ainda vai ver</option>}
                        {TIPOS_MATERIAL.map((t) => (
                          <option key={t} value={t}>
                            {ROTULO_MATERIAL[t]}
                          </option>
                        ))}
                      </select>
                      {a.tipo === "logo_parceiro" && (
                        <input
                          value={a.descricao}
                          onChange={(e) => mudarNomeParceiro(a.id, e.target.value)}
                          maxLength={120}
                          aria-label={`Nome que aciona a ${rotuloDoAnexo(a.id)}`}
                          placeholder="Nome no pedido"
                          className="input min-h-8 py-1 px-2 lg:text-[13px]"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {logos.length > 1 && (
                <p className="text-[12px] text-[var(--muted)] mt-2">
                  Mais de uma logo: as artes usam a primeira da lista.
                </p>
              )}
            </fieldset>
          </div>

          <div className="border-t border-[var(--border)] px-4 lg:px-5 py-3 flex flex-col gap-2">
            {promessas.length > 0 && (
              <p className="flex gap-1.5 text-[12px] text-[var(--warning)]">
                <TriangleAlert size={14} className="shrink-0 mt-px" aria-hidden="true" />
                <span>
                  {promessas.join("; ")}. Palavra de promessa no cadastro deixa de ser conferida nas artes.
                </span>
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-[12px] text-[var(--muted)] min-w-0">
                {pronto
                  ? "Dá para cadastrar. O resto você completa quando quiser."
                  : faltando.length > 0
                    ? `Falta: ${faltando.join(", ")}`
                    : `${preenchidos} de ${CAMPOS_FICHA.length} campos preenchidos`}
              </p>
              <button
                type="button"
                onClick={abrirRevisao}
                disabled={!carregado || Boolean(pensando) || subindo || !r.ficha.nome.trim()}
                className="btn btn-primary shrink-0"
              >
                Revisar e cadastrar
              </button>
            </div>
          </div>
        </section>
      </div>

      {revisando && (
        <Modal titulo={`Cadastrar ${r.ficha.nome.trim()}`} aoFechar={() => setRevisando(false)}>
          <form onSubmit={cadastrar} className="flex flex-col gap-4">
            <Resumo ficha={r.ficha} materiais={materiais} />
            <ComoEntra modo={modo} aoMudar={setModo} hoje={hoje} precos={precos} />
            {erroCadastro && (
              <p role="alert" className="text-[13px] text-[var(--danger)]">
                {erroCadastro.texto}
                {erroCadastro.clienteId && (
                  <>
                    {" "}
                    <Link href={`/clientes/${erroCadastro.clienteId}`} className="font-medium underline">
                      Abrir o cliente
                    </Link>
                  </>
                )}
              </p>
            )}
            <button
              type="submit"
              disabled={cadastrando || Boolean(erroCadastro?.clienteId)}
              className="btn btn-primary self-end"
            >
              {cadastrando && <span className="spinner" aria-hidden="true" />}
              {modo === "plano" ? "Cadastrar com plano" : "Cadastrar em teste"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}

function MensagemDaIA({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 max-w-[92%]">
      <span
        className="shrink-0 w-7 h-7 rounded-full bg-[var(--surface-muted)] text-[var(--foreground)] flex items-center justify-center"
        aria-hidden="true"
      >
        <Sparkles size={14} />
      </span>
      <div className="min-w-0 pt-0.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words">{children}</div>
    </div>
  );
}

function Miniaturas({ ids, anexos, direita = false }: { ids: string[]; anexos: AnexoCadastro[]; direita?: boolean }) {
  const lista = ids.map((id) => anexos.find((a) => a.id === id)).filter((a): a is AnexoCadastro => Boolean(a));
  if (lista.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 whitespace-normal ${direita ? "justify-end" : "mt-2"}`}>
      {lista.map((a) => (
        <li key={a.id} className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={a.url}
            alt={a.descricao || rotuloDoAnexo(a.id)}
            className="w-16 h-16 rounded-lg object-cover border border-[var(--border)] bg-[var(--surface)]"
          />
          <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">
            {a.id.slice(1)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CampoDaFicha({
  def,
  valor,
  recente,
  aoMudar,
}: {
  def: DefCampo;
  valor: string;
  recente: boolean;
  aoMudar: (campo: CampoFicha, valor: string) => void;
}) {
  const destaque = recente ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "";
  return (
    <label data-campo={def.campo} className={`flex flex-col min-w-0 ${def.largo ? "sm:col-span-2" : ""}`}>
      <span className="label">{def.rotulo}</span>
      {def.linhas ? (
        <textarea
          value={valor}
          onChange={(e) => aoMudar(def.campo, e.target.value)}
          rows={def.linhas}
          maxLength={LIMITE_CAMPO[def.campo]}
          placeholder={def.dica}
          className={`input resize-y transition-colors ${destaque}`}
        />
      ) : (
        <input
          value={valor}
          onChange={(e) => aoMudar(def.campo, e.target.value)}
          maxLength={LIMITE_CAMPO[def.campo]}
          placeholder={def.dica}
          className={`input transition-colors ${destaque}`}
        />
      )}
    </label>
  );
}

// O que entra no cadastro, para o sócio conferir antes de escolher o plano.
function Resumo({ ficha, materiais }: { ficha: FichaCadastro; materiais: AnexoCadastro[] }) {
  const identidade = (
    ["cores_primarias", "cores_secundarias", "tipografia", "tom_de_voz", "estilo_visual", "regras_obrigatorias", "regras_proibidas"] as const
  ).filter((c) => ficha[c].trim()).length;
  const contatos = (["whatsapp", "instagram", "endereco", "horario_funcionamento"] as const).filter((c) =>
    ficha[c].trim(),
  ).length;
  const porTipo = new Map<TipoMaterial, number>();
  for (const m of materiais) if (m.tipo) porTipo.set(m.tipo, (porTipo.get(m.tipo) ?? 0) + 1);
  const listaMateriais = [...porTipo.entries()].map(([tipo, n]) => `${n} ${ROTULO_MATERIAL[tipo].toLowerCase()}`);

  return (
    <div className="quadro p-3.5 text-[13px] flex flex-col gap-1">
      <p className="font-medium">
        {ficha.nome.trim()}
        {ficha.nicho.trim() && <span className="font-normal text-[var(--muted)]"> · {ficha.nicho.trim()}</span>}
      </p>
      <p className="text-[var(--muted)]">
        Identidade: {identidade} de 7 campos · Contato nas artes: {contatos} de 4
      </p>
      <p className="text-[var(--muted)]">
        Materiais: {listaMateriais.length > 0 ? listaMateriais.join(", ") : "nenhum"}
      </p>
      {!porTipo.has("logo") && (
        <p className="text-[var(--warning)]">Sem logo. Dá para subir depois, na página do cliente.</p>
      )}
    </div>
  );
}
