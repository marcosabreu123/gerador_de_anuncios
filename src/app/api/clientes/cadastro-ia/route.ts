import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { transcreverAudio } from "@/lib/ai/agente-pedido";
import { conversarCadastro, prepararImagem, recortarLogo, type ImagemNova } from "@/lib/ai/cadastro-ia";
import { TEXT_PROMPT_BUILDER_MODEL } from "@/lib/ai/models";
import {
  CAMPOS_FICHA,
  anexosValidos,
  fichaValida,
  mensagensValidas,
  sessaoValida,
  type AnexoCadastro,
  type CampoFicha,
  type RespostaCadastro,
} from "@/lib/agencia/cadastro-ia";
import { PRECO_TRANSCRICAO_USD_POR_MINUTO, custoTextoUSD, registrarGeracao } from "@/lib/agencia/custo";

export const runtime = "nodejs";
export const maxDuration = 120;

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

// Áudio de mais de uns 10 minutos não é conversa de cadastro.
const AUDIO_MAXIMO = 20 * 1024 * 1024;

// Uma rodada da conversa do cadastro com IA. Não grava cliente nenhum: devolve o que
// mudar na ficha, e a tela guarda tudo até o sócio clicar em cadastrar.
//
// O custo entra em `geracoes` sem cliente, marcado com a sessão do cadastro. Quando
// o cliente é cadastrado, a action passa esse custo para ele.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  // Cadastrar cliente é decisão comercial: só o sócio, como no cadastro à mão.
  const { data: perfil } = await supabase.from("users").select("papel, ativo").eq("id", user.id).maybeSingle();
  if (!perfil?.ativo || perfil.papel !== "socio") {
    return NextResponse.json({ error: "Só o sócio cadastra cliente." }, { status: 403 });
  }

  let dados: Record<string, unknown> = {};
  let audio: File | null = null;
  try {
    const form = await request.formData();
    const bruto = JSON.parse(String(form.get("dados") ?? "{}"));
    if (bruto && typeof bruto === "object") dados = bruto as Record<string, unknown>;
    const arquivo = form.get("audio");
    if (arquivo instanceof File && arquivo.size > 0) audio = arquivo;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const sessao = sessaoValida(dados.sessao);
  if (!sessao) return NextResponse.json({ error: "Recomece o cadastro." }, { status: 400 });
  if (audio && audio.size > AUDIO_MAXIMO) {
    return NextResponse.json({ error: "Áudio longo demais. Grave em partes." }, { status: 400 });
  }

  const prefixo = supabase.storage.from(BUCKET).getPublicUrl(`${user.id}/`).data.publicUrl;
  const ficha = fichaValida(dados.ficha);
  const editados = Array.isArray(dados.editados)
    ? dados.editados.filter((c): c is CampoFicha => CAMPOS_FICHA.includes(c as CampoFicha))
    : [];
  const anexos = anexosValidos(dados.anexos, prefixo);
  const historico = mensagensValidas(dados.mensagens, 24);
  let mensagem = typeof dados.mensagem === "string" ? dados.mensagem.trim().slice(0, 4000) : "";

  let transcricao: string | undefined;
  if (audio) {
    const inicio = Date.now();
    try {
      const resultado = await transcreverAudio(audio, ficha.nome || undefined);
      transcricao = resultado.texto.trim();
      const minutos = (resultado.duracaoSegundos ?? audio.size / 32_000) / 60;
      await registrarGeracao({
        tipo: "transcricao",
        modelo: "whisper-1",
        custoUsd: minutos * PRECO_TRANSCRICAO_USD_POR_MINUTO,
        usageRaw: { cadastro: sessao },
        duracaoMs: Date.now() - inicio,
      });
    } catch (e) {
      console.error("[/api/clientes/cadastro-ia] transcrição:", e);
      return NextResponse.json({ error: "Não consegui ouvir o áudio. Grave de novo ou digite." }, { status: 502 });
    }
    if (!transcricao) {
      return NextResponse.json({ error: "Não entendi o áudio. Grave de novo ou digite." }, { status: 400 });
    }
    mensagem = [mensagem, transcricao].filter(Boolean).join("\n");
  }

  const novos = anexos.filter((a) => a.nova);
  if (!mensagem && novos.length === 0) {
    return NextResponse.json({ error: "Escreva, grave ou mande uma imagem." }, { status: 400 });
  }

  // Imagem que não abre fica de fora desta rodada, e a conversa segue com as outras.
  const preparadas = await Promise.all(novos.map((a) => prepararImagem(a.url)));
  const originais = new Map<string, Buffer>();
  const novas: ImagemNova[] = [];
  const paletas: Record<string, string[]> = {};
  novos.forEach((a, i) => {
    const imagem = preparadas[i];
    if (!imagem) return;
    originais.set(a.id, imagem.original);
    novas.push({ id: a.id, dataUrl: imagem.dataUrl, paleta: imagem.paleta });
    paletas[a.id] = imagem.paleta;
  });
  if (!mensagem && novas.length === 0) {
    return NextResponse.json({ error: "Não consegui abrir as imagens. Mande de novo." }, { status: 400 });
  }

  const inicio = Date.now();
  try {
    const saida = await conversarCadastro({
      ficha,
      editados,
      vistos: anexos.filter((a) => !a.nova),
      novas,
      historico,
      mensagem,
    });

    await registrarGeracao({
      tipo: "texto",
      modelo: saida.uso.modelo,
      custoUsd: custoTextoUSD(saida.uso.modelo, saida.uso.entrada, saida.uso.saida),
      usageRaw: { entrada: saida.uso.entrada, saida: saida.uso.saida, estimado: false, cadastro: sessao },
      duracaoMs: Date.now() - inicio,
    });

    const novosAnexos = await recortarSePreciso(saida.materiais, anexos, originais, user.id);

    const resposta: RespostaCadastro = {
      resposta: saida.resposta,
      alteracoes: saida.alteracoes,
      materiais: saida.materiais.map(({ id, tipo, descricao }) => ({ id, tipo, descricao })),
      paletas,
      novosAnexos,
      faltando: saida.faltando,
      naoAbriram: novos.filter((a) => !originais.has(a.id)).map((a) => a.id),
      transcricao,
    };
    return NextResponse.json(resposta);
  } catch (e) {
    console.error("[/api/clientes/cadastro-ia]", e);
    // Falha também custa. Sem usage na resposta, estima pelo tamanho da chamada.
    await registrarGeracao({
      tipo: "texto",
      modelo: TEXT_PROMPT_BUILDER_MODEL,
      custoUsd: custoTextoUSD(TEXT_PROMPT_BUILDER_MODEL, 3000 + novas.length * 800, 600),
      usageRaw: { estimado: true, cadastro: sessao },
      duracaoMs: Date.now() - inicio,
      sucesso: false,
      erro: e instanceof Error ? e.message : String(e),
    });
    // A transcrição volta junto: o que o sócio falou não pode se perder.
    return NextResponse.json(
      { error: "A IA não respondeu agora. Tente de novo.", transcricao },
      { status: 500 },
    );
  }
}

// Sem logo em arquivo próprio, a IA aponta onde a logo está numa foto ou arte, e o
// app recorta. O recorte entra como material novo, e o sócio confere antes de cadastrar.
async function recortarSePreciso(
  materiais: { id: string; tipo: string; recorteLogo: { x: number; y: number; largura: number; altura: number } | null }[],
  anexos: AnexoCadastro[],
  originais: Map<string, Buffer>,
  userId: string,
): Promise<AnexoCadastro[]> {
  const temLogo =
    materiais.some((m) => m.tipo === "logo") ||
    anexos.some((a) => a.tipo === "logo" && !materiais.some((m) => m.id === a.id));
  if (temLogo) return [];

  const pedido = materiais.find((m) => m.recorteLogo && originais.has(m.id));
  if (!pedido?.recorteLogo) return [];
  const id = `r${pedido.id.slice(1)}`;
  if (anexos.some((a) => a.id === id)) return [];

  const recorte = await recortarLogo(originais.get(pedido.id)!, pedido.recorteLogo);
  if (!recorte) return [];

  try {
    // O Storage só aceita do navegador caminho na pasta do próprio usuário; aqui é o
    // servidor que sobe, com o client admin, mas na mesma pasta, para a URL passar
    // pela mesma conferência das outras imagens.
    const admin = createAdminClient();
    const caminho = `${userId}/cadastro-ia/${crypto.randomUUID()}.png`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(caminho, recorte.png, { contentType: "image/png", upsert: false });
    if (error) throw error;
    const url = admin.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl;
    return [
      {
        id,
        url,
        tipo: "logo",
        descricao: `Logo recortada da imagem ${pedido.id.slice(1)}`,
        paleta: recorte.paleta,
        nova: false,
        editado: false,
        recorte: true,
      },
    ];
  } catch (e) {
    console.error("[/api/clientes/cadastro-ia] falha ao subir o recorte:", e);
    return [];
  }
}
