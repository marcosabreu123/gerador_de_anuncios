import { createAdminClient } from "@/lib/supabase/admin";
import {
  montarPrompt,
  montarPromptAjusteGptImage,
  montarPromptMelhorarArteExistente,
} from "@/lib/ai/prompt-builder";
import { materiaisDisponiveis, pedidoManualParaBriefing } from "@/lib/ai/agente-pedido";
import { gerarVariacoes, type EntradaImagem } from "@/lib/ai/openai-image";
import { IMAGE_MODEL, TAMANHO_POR_FORMATO, qualidadeParaEtapa } from "@/lib/ai/models";
import { custoImagemUSD, custoTextoUSD, registrarGeracao } from "./custo";
import { consumirImagemComoWorker } from "./pacotes";
import type { BrandKit, BriefingPecaManual, Cliente, Referencia } from "./types";
import type { Formato } from "@/lib/types";

// Produção de UMA peça, do briefing à imagem salva. Roda no worker da fila
// (sem sessão de usuário), por isso usa o client admin em tudo.
//
// Reaproveita o motor de direção de arte que já existia (montarPrompt +
// gerarVariacoes): a remodelagem trocou quem pede e como pede, não como a
// arte é construída.

const BUCKET = process.env.NEXT_PUBLIC_SUPABASE_BUCKET ?? "produtos";

async function baixarComoEntrada(url: string, tipo: EntradaImagem["tipo"]): Promise<EntradaImagem | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mimeType = res.headers.get("content-type") ?? "image/jpeg";
    const buf = Buffer.from(await res.arrayBuffer());
    return { base64: buf.toString("base64"), mimeType, tipo };
  } catch (e) {
    // Referência indisponível não pode derrubar a peça inteira: a arte sai
    // sem aquele material, o que é melhor do que não sair.
    console.error("[gerar-peca] falha ao baixar referência:", url, e);
    return null;
  }
}

async function subirImagem(clienteId: string, base64: string): Promise<string> {
  const supabase = createAdminClient();
  const nome = `${crypto.randomUUID()}.png`;
  const path = `agencia/${clienteId}/${nome}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(base64, "base64"), { contentType: "image/png", upsert: false });
  if (error) {
    console.error("[gerar-peca] upload falhou:", error);
    throw new Error("Falha ao salvar a imagem no Storage.");
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export interface ResultadoGeracaoPeca {
  imagemUrl: string;
  promptUsado: string;
  saldoRestante: number | null;
}

export async function gerarPeca(pecaId: string): Promise<ResultadoGeracaoPeca> {
  const supabase = createAdminClient();

  const { data: peca } = await supabase.from("pecas").select("*").eq("id", pecaId).maybeSingle();
  if (!peca) throw new Error("Peça não encontrada.");

  const { data: cliente } = await supabase
    .from("clientes")
    .select("*")
    .eq("id", peca.cliente_id)
    .maybeSingle();
  if (!cliente) throw new Error("Cliente não encontrado.");

  const { data: brandKit } = await supabase
    .from("brand_kits")
    .select("*")
    .eq("cliente_id", peca.cliente_id)
    .maybeSingle();

  const { data: referenciasRaw } = await supabase
    .from("referencias")
    .select("*")
    .eq("cliente_id", peca.cliente_id);

  const referencias = (referenciasRaw ?? []) as Referencia[];
  await supabase.from("pecas").update({ status: "gerando", erro: null }).eq("id", pecaId);

  // Materiais do cliente que entram como imagem de entrada. Limitado de
  // propósito: cada imagem extra encarece e alonga a chamada, e mais de uma
  // foto de produto por peça raramente melhora o resultado.
  const logo = referencias.find((r) => r.tipo === "logo");
  const produto = referencias.find((r) => r.tipo === "produto");

  const entradas: EntradaImagem[] = [];
  if (produto) {
    const e = await baixarComoEntrada(produto.url, "produto");
    if (e) entradas.push(e);
  }
  if (logo) {
    const e = await baixarComoEntrada(logo.url, "logotipo");
    if (e) entradas.push(e);
  }

  const manual = (peca.briefing ?? {}) as BriefingPecaManual;
  const formato: Formato = manual.formato ?? "feed-4-5";

  const briefing = pedidoManualParaBriefing(manual, cliente as Cliente, (brandKit as BrandKit) ?? null, {
    // O que de fato foi anexado manda, não o que o cadastro promete: se a
    // referência não baixou, o prompt não pode prometer foto ao modelo.
    temFotoProduto: entradas.some((e) => e.tipo === "produto"),
    temLogotipo: entradas.some((e) => e.tipo === "logotipo"),
    temReferencia: materiaisDisponiveis(referencias).temReferencia,
  });

  // Três caminhos possíveis, nesta ordem de precedência:
  //
  // 1. Ajuste cirúrgico — o operador clicou "Ajustar" numa peça entregue e
  //    pediu uma mudança pontual. Edita AQUELA imagem e preserva o resto.
  // 2. Arte-base — ele subiu uma peça pronta para melhorar ou recriar.
  // 3. Criação do zero, a partir do briefing do cliente.
  //
  // O ajuste vem primeiro porque é o mais específico: a peça de um ajuste
  // pode ter nascido de uma arte-base, e nesse caso o que vale é a imagem que
  // ele está olhando agora, não a que originou a peça.
  const ajustando = Boolean(manual.ajusteSobreUrl && manual.instrucaoAjuste);
  const urlDeEntrada = ajustando ? manual.ajusteSobreUrl : manual.arteBaseUrl;
  const transformandoArte = Boolean(urlDeEntrada);

  if (urlDeEntrada) {
    const base = await baixarComoEntrada(urlDeEntrada, "base");
    if (!base) throw new Error("Não consegui ler a arte usada como base.");
    // A arte-base vai na frente: é a referência principal da geração.
    entradas.unshift(base);
  }

  // 1) Prompt (custo de texto)
  const inicioPrompt = Date.now();
  const { prompts } = ajustando
    ? await montarPromptAjusteGptImage(peca.prompt_usado ?? "", manual.instrucaoAjuste!).then((r) => ({
        prompts: [r.prompt],
      }))
    : transformandoArte
      ? await montarPromptMelhorarArteExistente({
          modoTransformacao: manual.modoTransformacao ?? "melhoria_recompositiva",
          direcao: "personalizado",
          instrucaoUsuario: manual.prompt,
        }).then((r) => ({ prompts: [r.prompt] }))
      : await montarPrompt(briefing);
  await registrarGeracao({
    tipo: "texto",
    modelo: "gpt-5.4",
    // O prompt-builder não devolve usage; estimativa conservadora até
    // expormos o usage real por lá. Fica registrado para não sumir do rateio.
    custoUsd: custoTextoUSD("gpt-5.4", 3000, 1200),
    duracaoMs: Date.now() - inicioPrompt,
    pecaId: peca.id,
    pedidoId: peca.pedido_id,
    clienteId: peca.cliente_id,
  });

  // 2) Imagem
  const qualidade = qualidadeParaEtapa("final");
  const inicioImagem = Date.now();
  let imagens;
  try {
    imagens = await gerarVariacoes({
      prompts: [prompts[0]],
      imagens: entradas,
      tamanho: TAMANHO_POR_FORMATO[formato],
      qualidade,
    });
  } catch (e) {
    await registrarGeracao({
      tipo: "imagem",
      modelo: IMAGE_MODEL,
      qualidade,
      tamanho: TAMANHO_POR_FORMATO[formato],
      custoUsd: custoImagemUSD(IMAGE_MODEL, qualidade),
      duracaoMs: Date.now() - inicioImagem,
      sucesso: false,
      erro: e instanceof Error ? e.message : String(e),
      pecaId: peca.id,
      pedidoId: peca.pedido_id,
      clienteId: peca.cliente_id,
    });
    throw e;
  }

  await registrarGeracao({
    tipo: "imagem",
    modelo: IMAGE_MODEL,
    qualidade,
    tamanho: TAMANHO_POR_FORMATO[formato],
    custoUsd: custoImagemUSD(IMAGE_MODEL, qualidade),
    duracaoMs: Date.now() - inicioImagem,
    pecaId: peca.id,
    pedidoId: peca.pedido_id,
    clienteId: peca.cliente_id,
  });

  const imagemUrl = await subirImagem(peca.cliente_id, imagens[0].base64);

  // 3) Débito do pacote — uma vez por peça, nunca por regeração.
  let saldoRestante: number | null = null;
  if (!peca.pacote_consumido) {
    saldoRestante = await consumirImagemComoWorker(peca.cliente_id);
    // Saldo esgotado não descarta a peça já produzida (seria jogar fora
    // dinheiro de API já gasto): entrega e deixa o negativo visível no
    // dashboard para o operador cobrar o próximo pacote.
    if (saldoRestante >= 0) {
      await supabase.from("pecas").update({ pacote_consumido: true }).eq("id", pecaId);
    }
  }

  await supabase
    .from("pecas")
    .update({
      status: "gerada",
      imagem_url: imagemUrl,
      prompt_usado: imagens[0].promptUsado,
      erro: null,
    })
    .eq("id", pecaId);

  // Pedido concluído quando nenhuma peça segue pendente/gerando.
  const { data: restantes } = await supabase
    .from("pecas")
    .select("id")
    .eq("pedido_id", peca.pedido_id)
    .in("status", ["pendente", "gerando"]);

  if (!restantes || restantes.length === 0) {
    await supabase
      .from("pedidos")
      .update({ status: "concluido", concluido_em: new Date().toISOString() })
      .eq("id", peca.pedido_id);
  }

  return { imagemUrl, promptUsado: imagens[0].promptUsado, saldoRestante };
}
