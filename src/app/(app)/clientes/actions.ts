"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperador, requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PACOTE_ENTRADA } from "@/lib/agencia/pacotes";
import type { BriefingPecaManual } from "@/lib/agencia/types";

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

// Vende um pacote. Cria o pacote e já registra o pagamento correspondente —
// no controle manual os dois acontecem juntos (cliente paga o Pix e o saldo
// entra). Quando houver gateway, o pagamento passa a nascer "pendente".
export async function venderPacote(form: FormData) {
  const { authId } = await requireSocio();
  const supabase = await createClient();
  const clienteId = texto(form, "cliente_id");
  if (!clienteId) return;

  const qtd = Number(form.get("qtd_imagens")) || PACOTE_ENTRADA.qtdImagens;
  const valorReais = Number(String(form.get("valor_reais") ?? "").replace(",", "."));
  const valorCentavos = Number.isFinite(valorReais) && valorReais > 0
    ? Math.round(valorReais * 100)
    : PACOTE_ENTRADA.valorCentavos;

  const jaPago = form.get("ja_pago") === "on";

  const { data: pacote } = await supabase
    .from("pacotes")
    .insert({
      cliente_id: clienteId,
      nome: texto(form, "nome") ?? `Pacote ${qtd} imagens`,
      qtd_imagens: qtd,
      valor_centavos: valorCentavos,
      validade: texto(form, "validade"),
    })
    .select("id")
    .single();

  await supabase.from("pagamentos").insert({
    pacote_id: pacote?.id ?? null,
    cliente_id: clienteId,
    valor_centavos: valorCentavos,
    metodo: texto(form, "metodo") ?? "pix",
    status: jaPago ? "confirmado" : "pendente",
    pago_em: jaPago ? new Date().toISOString() : null,
    registrado_por: authId,
  });

  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/dashboard");
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
    .eq("id", id);

  if (clienteId) revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/dashboard");
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
