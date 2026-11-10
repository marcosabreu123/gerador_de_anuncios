"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperador, requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diaValido, hojeSP } from "@/lib/datas";
import { duracaoValida, nomeDoPlano, vencimentoDoPlano } from "@/lib/agencia/cobrancas";
import { METODOS_PAGAMENTO, reaisParaCentavos, type BriefingPecaManual } from "@/lib/agencia/types";

// Server Actions do cadastro da agência. CRUD simples vai direto por action
// (sem rota de API) — rota só onde há processamento pesado ou chamada de IA.

function texto(form: FormData, campo: string): string | null {
  const valor = form.get(campo);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

// Campos multi-linha viram array (uma regra por linha) — é como o operador
// naturalmente escreve "sempre mostrar o WhatsApp / nunca usar fundo roxo".
function listaDeLinhas(form: FormData, campo: string): string[] {
  const valor = form.get(campo);
  if (typeof valor !== "string") return [];
  return valor
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function criarCliente(form: FormData) {
  const { authId } = await requireOperador();
  const supabase = await createClient();

  const nome = texto(form, "nome");
  if (!nome) return;

  const { data } = await supabase
    .from("clientes")
    .insert({
      nome,
      nicho: texto(form, "nicho"),
      contato_nome: texto(form, "contato_nome"),
      contato_telefone: texto(form, "contato_telefone"),
      observacoes: texto(form, "observacoes"),
      criado_por: authId,
    })
    .select("id")
    .single();

  revalidatePath("/clientes");
  if (data) redirect(`/clientes/${data.id}`);
}

export async function atualizarCliente(form: FormData) {
  await requireOperador();
  const supabase = await createClient();
  const id = texto(form, "id");
  if (!id) return;

  await supabase
    .from("clientes")
    .update({
      nome: texto(form, "nome"),
      nicho: texto(form, "nicho"),
      contato_nome: texto(form, "contato_nome"),
      contato_telefone: texto(form, "contato_telefone"),
      observacoes: texto(form, "observacoes"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath(`/clientes/${id}`);
}

export async function salvarBrandKit(form: FormData) {
  await requireOperador();
  const supabase = await createClient();
  const clienteId = texto(form, "cliente_id");
  if (!clienteId) return;

  const dados = {
    cliente_id: clienteId,
    cores_primarias: texto(form, "cores_primarias"),
    cores_secundarias: texto(form, "cores_secundarias"),
    tipografia: texto(form, "tipografia"),
    estilo_visual: texto(form, "estilo_visual"),
    tom_de_voz: texto(form, "tom_de_voz"),
    regras_obrigatorias: listaDeLinhas(form, "regras_obrigatorias"),
    regras_proibidas: listaDeLinhas(form, "regras_proibidas"),
    whatsapp: texto(form, "whatsapp"),
    endereco: texto(form, "endereco"),
    horario_funcionamento: texto(form, "horario_funcionamento"),
    instagram: texto(form, "instagram"),
    updated_at: new Date().toISOString(),
  };

  // upsert por cliente_id (unique): o brand kit é 1:1 com o cliente, então
  // salvar duas vezes atualiza em vez de duplicar.
  await supabase.from("brand_kits").upsert(dados, { onConflict: "cliente_id" });
  revalidatePath(`/clientes/${clienteId}`);
}

export async function adicionarReferencia(form: FormData) {
  await requireOperador();
  const supabase = await createClient();
  const clienteId = texto(form, "cliente_id");
  const url = texto(form, "url");
  if (!clienteId || !url) return;

  await supabase.from("referencias").insert({
    cliente_id: clienteId,
    tipo: texto(form, "tipo") ?? "referencia_visual",
    url,
    descricao: texto(form, "descricao"),
  });

  revalidatePath(`/clientes/${clienteId}`);
}

export async function removerReferencia(form: FormData) {
  await requireOperador();
  const supabase = await createClient();
  const id = texto(form, "id");
  const clienteId = texto(form, "cliente_id");
  if (!id) return;

  await supabase.from("referencias").delete().eq("id", id);
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
}

// Telas que mostram saldo, plano ou dinheiro do cliente.
function revalidarCobranca(clienteId: string | null) {
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/clientes");
  revalidatePath("/cobrancas");
  revalidatePath("/dashboard");
}

// Vende um plano por tempo ou um pacote avulso de imagens, e registra o
// pagamento junto: um pagamento por venda, no valor total, mesmo no plano anual.
// No controle manual os dois acontecem juntos (o cliente paga e o saldo entra).
// Quando houver gateway, o pagamento passa a nascer "pendente".
export async function venderPacote(form: FormData): Promise<{ erro?: string }> {
  const { authId } = await requireSocio();
  const supabase = await createClient();
  const clienteId = texto(form, "cliente_id");
  if (!clienteId) return { erro: "Cliente não informado." };

  const tipo = form.get("tipo") === "tempo" ? "tempo" : "imagens";
  const qtd = Number(form.get("qtd_imagens"));
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > 10_000) {
    return { erro: "Informe quantas imagens entram, em número inteiro." };
  }
  const valorCentavos = reaisParaCentavos(texto(form, "valor_reais"));
  if (valorCentavos === null) return { erro: "Informe o valor cobrado." };

  const hoje = hojeSP();
  const assinadoEm = diaValido(texto(form, "assinado_em")) ?? hoje;
  if (assinadoEm > hoje) return { erro: "A data de assinatura não pode ser depois de hoje." };

  const metodoPedido = texto(form, "metodo") ?? "pix";
  const metodo = metodoPedido in METODOS_PAGAMENTO ? metodoPedido : "pix";
  const jaPago = form.get("ja_pago") === "on";

  let plano: { meses: number; validade: string } | null = null;
  if (tipo === "tempo") {
    const meses = Number(form.get("meses"));
    if (!duracaoValida(meses)) return { erro: "Escolha a duração do plano." };
    // Com plano em vigor, o novo começa quando ele acaba (ver vencimentoDoPlano).
    const { data: cobertura } = await supabase
      .from("pacotes")
      .select("validade")
      .eq("cliente_id", clienteId)
      .eq("tipo", "tempo")
      .neq("status", "cancelado")
      .not("validade", "is", null)
      .order("validade", { ascending: false })
      .limit(1)
      .maybeSingle();
    plano = { meses, validade: vencimentoDoPlano(assinadoEm, meses, cobertura?.validade ?? null) };
  }

  const { data: pacote, error } = await supabase
    .from("pacotes")
    .insert({
      cliente_id: clienteId,
      nome: plano ? nomeDoPlano(plano.meses) : `Pacote ${qtd} imagens`,
      tipo,
      meses: plano?.meses ?? null,
      qtd_imagens: qtd,
      valor_centavos: valorCentavos,
      validade: plano?.validade ?? null,
      assinado_em: assinadoEm,
    })
    .select("id")
    .single();
  if (error || !pacote) {
    console.error("[cobranca] erro ao registrar pacote:", error);
    return { erro: "Não consegui registrar. Tente de novo." };
  }

  // Lançado depois do dia em que foi pago, o pagamento fica no dia da assinatura:
  // é nesse mês que a receita entra no painel.
  const pagoEm = assinadoEm < hoje ? `${assinadoEm}T15:00:00.000Z` : new Date().toISOString();

  const { error: erroPagamento } = await supabase.from("pagamentos").insert({
    pacote_id: pacote.id,
    cliente_id: clienteId,
    valor_centavos: valorCentavos,
    metodo,
    status: jaPago ? "confirmado" : "pendente",
    pago_em: jaPago ? pagoEm : null,
    registrado_por: authId,
  });

  revalidarCobranca(clienteId);
  if (erroPagamento) {
    console.error("[cobranca] erro ao registrar pagamento:", erroPagamento);
    return { erro: "O plano entrou, mas o pagamento não. Confira a lista e tente marcar de novo." };
  }
  return {};
}

export async function confirmarPagamento(form: FormData) {
  await requireSocio();
  const supabase = await createClient();
  const id = texto(form, "id");
  const clienteId = texto(form, "cliente_id");
  if (!id) return;

  await supabase
    .from("pagamentos")
    .update({ status: "confirmado", pago_em: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pendente");

  revalidarCobranca(clienteId);
}

// Cancela um plano ou pacote lançado por engano ou desfeito com o cliente. As
// imagens que sobraram deixam de valer e o pagamento ainda em aberto sai da conta
// a receber. O que já foi pago continua registrado como pago: devolver dinheiro
// é outra conversa.
export async function cancelarPacote(form: FormData) {
  await requireSocio();
  const supabase = await createClient();
  const id = texto(form, "id");
  const clienteId = texto(form, "cliente_id");
  if (!id) return;

  await supabase.from("pacotes").update({ status: "cancelado" }).eq("id", id);
  await supabase.from("pagamentos").update({ status: "estornado" }).eq("pacote_id", id).eq("status", "pendente");

  revalidarCobranca(clienteId);
}

// Registra o tempo humano gasto na peça. É o número que decide se o pacote
// de R$ 34,90 por 10 imagens fecha a conta — custo de API quase nunca é o
// gargalo, tempo de gente é.
export async function registrarTempoPeca(form: FormData) {
  await requireOperador();
  const supabase = await createClient();
  const id = texto(form, "id");
  const pedidoId = texto(form, "pedido_id");
  const minutos = Number(form.get("minutos"));
  if (!id || !Number.isFinite(minutos) || minutos < 0) return;

  await supabase
    .from("pecas")
    .update({ tempo_operacao_segundos: Math.round(minutos * 60) })
    .eq("id", id);

  if (pedidoId) revalidatePath(`/pedidos/${pedidoId}`);
}

export async function aprovarPeca(form: FormData) {
  await requireOperador();
  const supabase = await createClient();
  const id = texto(form, "id");
  const pedidoId = texto(form, "pedido_id");
  const clienteId = texto(form, "cliente_id");
  if (!id) return;

  await supabase
    .from("pecas")
    .update({ status: "aprovada", aprovada_em: new Date().toISOString() })
    .eq("id", id);

  // Arte aprovada vira referência do cliente: é o material que faz os
  // próximos pedidos saírem mais perto do esperado já na primeira tentativa,
  // reduzindo retrabalho (= custo).
  const { data: peca } = await supabase.from("pecas").select("imagem_url, titulo").eq("id", id).maybeSingle();
  if (peca?.imagem_url && clienteId) {
    await supabase.from("referencias").insert({
      cliente_id: clienteId,
      tipo: "arte_aprovada",
      url: peca.imagem_url,
      descricao: peca.titulo,
    });
  }

  if (pedidoId) revalidatePath(`/pedidos/${pedidoId}`);
  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
}

// Volta a peça para uma imagem que ela já teve. Nada é apagado: a que estava em uso
// continua na lista, e os próximos ajustes partem da versão escolhida.
export async function usarVersaoPeca(form: FormData) {
  await requireOperador();
  const supabase = await createClient();
  const id = texto(form, "id");
  const pedidoId = texto(form, "pedido_id");
  const url = texto(form, "url");
  if (!id || !url) return;

  const { data: peca } = await supabase.from("pecas").select("briefing, status").eq("id", id).maybeSingle();
  // Com a peça na fila, a imagem que está saindo tomaria o lugar da escolhida.
  if (!peca || peca.status === "pendente" || peca.status === "gerando") return;

  const briefing = (peca.briefing ?? {}) as BriefingPecaManual;
  const versao = briefing.versoes?.find((v) => v.url === url);
  if (!versao) return;

  const atualizado: BriefingPecaManual = { ...briefing, formato: versao.formato };
  delete atualizado.ajusteSobreUrl;
  delete atualizado.instrucaoAjuste;
  delete atualizado.formatoNovo;

  await supabase
    .from("pecas")
    .update({
      imagem_url: versao.url,
      prompt_usado: versao.promptUsado ?? null,
      briefing: atualizado,
      // A aprovação foi da outra imagem.
      status: "gerada",
      aprovada_em: null,
      erro: null,
    })
    .eq("id", id);

  if (pedidoId) revalidatePath(`/pedidos/${pedidoId}`);
}

// Arquiva ou reativa um cliente. Para uma carteira de dezenas de empresas, a
// lista precisa mostrar quem está ativo hoje — cliente que saiu não pode
// continuar ocupando a grade nem aparecer como opção de pedido.
//
// Arquivar NÃO apaga nada: pedidos, peças, pacotes e o custo já registrado
// continuam de pé, porque o histórico é o que sustenta o relatório do mês.
export async function alternarArquivoCliente(form: FormData) {
  await requireSocio();
  const supabase = await createClient();
  const id = texto(form, "id");
  if (!id) return;

  const { data: cliente } = await supabase
    .from("clientes")
    .select("ativo")
    .eq("id", id)
    .maybeSingle();
  if (!cliente) return;

  await supabase
    .from("clientes")
    .update({ ativo: !cliente.ativo, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
}
