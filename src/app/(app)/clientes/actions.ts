"use server";

import { revalidatePath } from "next/cache";
import { ehSocio, requireOperador, requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diaValido, hojeSP } from "@/lib/datas";
import { duracaoValida, nomeDoPlano, ultimoPlano, vencimentoDoPlano } from "@/lib/agencia/cobrancas";
import { debitarCredito } from "@/lib/agencia/pacotes";
import {
  METODOS_PAGAMENTO,
  reaisParaCentavos,
  type BriefingPecaManual,
  type Pacote,
} from "@/lib/agencia/types";

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

// ---------- Plano ----------

interface DadosPlano {
  meses: number;
  qtd: number;
  valorCentavos: number;
  assinadoEm: string;
  metodo: string;
  jaPago: boolean;
}

// Campos do plano, iguais no cadastro do cliente e na página dele. O menor plano
// é de 1 mês, contado do dia da contratação.
function lerPlano(form: FormData, hoje: string): { erro: string } | { plano: DadosPlano } {
  const meses = Number(form.get("meses"));
  if (!duracaoValida(meses)) return { erro: "Escolha a duração do plano." };
  const qtd = Number(form.get("qtd_imagens"));
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > 10_000) {
    return { erro: "Informe quantos créditos o plano tem, em número inteiro." };
  }
  const valorCentavos = reaisParaCentavos(texto(form, "valor_reais"));
  if (valorCentavos === null) return { erro: "Informe o valor do plano." };
  const assinadoEm = diaValido(texto(form, "assinado_em")) ?? hoje;
  if (assinadoEm > hoje) return { erro: "A data de contratação não pode ser depois de hoje." };
  const metodo = texto(form, "metodo") ?? "pix";
  return {
    plano: {
      meses,
      qtd,
      valorCentavos,
      assinadoEm,
      metodo: Object.hasOwn(METODOS_PAGAMENTO, metodo) ? metodo : "pix",
      jaPago: form.get("ja_pago") === "on",
    },
  };
}

// Registra o plano e o pagamento dele: um pagamento por plano, no valor total,
// mesmo no anual. No controle manual os dois acontecem juntos (o cliente paga e o
// saldo entra). Quando houver gateway, o pagamento passa a nascer "pendente".
//
// Sair do teste é começar a pagar: com o plano registrado, o cliente deixa de ser
// teste.
async function gravarPlano(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clienteId: string,
  plano: DadosPlano,
  authId: string,
): Promise<{ falhou?: "plano" | "pagamento" }> {
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

  const { data: pacote, error } = await supabase
    .from("pacotes")
    .insert({
      cliente_id: clienteId,
      nome: nomeDoPlano(plano.meses),
      tipo: "tempo",
      meses: plano.meses,
      qtd_imagens: plano.qtd,
      valor_centavos: plano.valorCentavos,
      validade: vencimentoDoPlano(plano.assinadoEm, plano.meses, cobertura?.validade ?? null),
      assinado_em: plano.assinadoEm,
    })
    .select("id")
    .single();
  if (error || !pacote) {
    console.error("[cobranca] erro ao registrar plano:", error);
    return { falhou: "plano" };
  }

  // Lançado depois do dia em que foi pago, o pagamento fica no dia da contratação:
  // é nesse mês que a receita entra no painel.
  const pagoEm = plano.assinadoEm < hojeSP() ? `${plano.assinadoEm}T15:00:00.000Z` : new Date().toISOString();

  const { error: erroPagamento } = await supabase.from("pagamentos").insert({
    pacote_id: pacote.id,
    cliente_id: clienteId,
    valor_centavos: plano.valorCentavos,
    metodo: plano.metodo,
    status: plano.jaPago ? "confirmado" : "pendente",
    pago_em: plano.jaPago ? pagoEm : null,
    registrado_por: authId,
  });

  await supabase
    .from("clientes")
    .update({ em_teste: false, updated_at: new Date().toISOString() })
    .eq("id", clienteId)
    .eq("em_teste", true);

  if (erroPagamento) {
    console.error("[cobranca] erro ao registrar pagamento:", erroPagamento);
    return { falhou: "pagamento" };
  }
  return {};
}

// Cadastro de cliente novo. Todo cliente entra com o primeiro plano ou em teste,
// e as duas coisas são decisão comercial: só o sócio cadastra.
export async function criarCliente(form: FormData): Promise<{ erro?: string; id?: string }> {
  const { authId } = await requireSocio();
  const supabase = await createClient();

  const nome = texto(form, "nome");
  if (!nome) return { erro: "Informe o nome da empresa." };

  const emTeste = form.get("modo") === "teste";
  let plano: DadosPlano | null = null;
  if (!emTeste) {
    // Confere o plano antes de cadastrar: com erro nele, nada é gravado.
    const lido = lerPlano(form, hojeSP());
    if ("erro" in lido) return { erro: lido.erro };
    plano = lido.plano;
  }

  const { data, error } = await supabase
    .from("clientes")
    .insert({
      nome,
      nicho: texto(form, "nicho"),
      contato_nome: texto(form, "contato_nome"),
      contato_telefone: texto(form, "contato_telefone"),
      observacoes: texto(form, "observacoes"),
      em_teste: emTeste,
      criado_por: authId,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[clientes] erro ao cadastrar cliente:", error);
    return { erro: "Não consegui cadastrar. Tente de novo." };
  }

  const resultado = plano ? await gravarPlano(supabase, data.id, plano, authId) : {};
  revalidarCobranca(data.id);
  if (resultado.falhou === "plano") {
    return { id: data.id, erro: "O cliente foi cadastrado, mas o plano não. Registre o plano na página dele." };
  }
  if (resultado.falhou === "pagamento") {
    return { id: data.id, erro: "O cliente e o plano foram cadastrados, mas o pagamento não. Confira na página dele." };
  }
  return { id: data.id };
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

  // O nome aparece também nas listas.
  revalidatePath(`/clientes/${id}`);
  revalidatePath("/producao");
  revalidatePath("/clientes");
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
  revalidatePath("/producao");
  revalidatePath("/dashboard");
  revalidatePath("/financeiro");
}

// Registra um plano na página do cliente: o primeiro, uma renovação ou um plano
// novo. A agência não vende mais pacote avulso de créditos.
export async function registrarPlano(form: FormData): Promise<{ erro?: string }> {
  const { authId } = await requireSocio();
  const supabase = await createClient();
  const clienteId = texto(form, "cliente_id");
  if (!clienteId) return { erro: "Cliente não informado." };

  const lido = lerPlano(form, hojeSP());
  if ("erro" in lido) return { erro: lido.erro };

  const resultado = await gravarPlano(supabase, clienteId, lido.plano, authId);
  revalidarCobranca(clienteId);
  if (resultado.falhou === "plano") return { erro: "Não consegui registrar o plano. Tente de novo." };
  if (resultado.falhou === "pagamento") {
    return { erro: "O plano entrou, mas o pagamento não. Confira o histórico e tente marcar de novo." };
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

// Cancela um plano ou pacote lançado por engano ou desfeito com o cliente. Os
// créditos que sobraram deixam de valer e o pagamento ainda em aberto sai da conta
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

export interface ResultadoAprovacao {
  erro?: string;
  // O cliente não tem crédito. O sócio pode aprovar mesmo assim.
  semCredito?: boolean;
}

// Aprovar é o que gasta crédito: 1 por arte, uma vez só. Ajustar ou trocar a
// versão de uma arte já debitada e aprovar de novo não cobra outra vez.
//
// Sem crédito, só o sócio aprova, e a arte fica sem débito: produzir fiado é
// decisão comercial, como o "gerar mesmo assim" da tela de pedido. Cliente em
// teste não usa crédito: aprova direto, sem débito.
export async function aprovarPeca(form: FormData): Promise<ResultadoAprovacao> {
  const { perfil } = await requireOperador();
  const supabase = await createClient();
  const id = texto(form, "id");
  if (!id) return { erro: "Peça não informada." };

  const { data: peca } = await supabase
    .from("pecas")
    .select("cliente_id, pedido_id, status, imagem_url, titulo, pacote_consumido")
    .eq("id", id)
    .maybeSingle();
  if (!peca?.imagem_url) return { erro: "Esta peça ainda não tem arte para aprovar." };
  if (peca.status === "aprovada") return {};
  if (peca.status === "pendente" || peca.status === "gerando") {
    return { erro: "Espere a arte terminar de sair para aprovar." };
  }

  const socio = ehSocio(perfil);
  // Sem conseguir ler o cliente, vale a regra normal: debita.
  const { data: dono } = await supabase.from("clientes").select("em_teste").eq("id", peca.cliente_id).maybeSingle();
  if (!peca.pacote_consumido && !dono?.em_teste) {
    // Marca antes de debitar: dois cliques em "Aprovar" não podem gastar dois créditos.
    const { data: reservada, error: erroReserva } = await supabase
      .from("pecas")
      .update({ pacote_consumido: true })
      .eq("id", id)
      .eq("pacote_consumido", false)
      .select("id");
    if (erroReserva) return { erro: "Não consegui aprovar. Tente de novo." };
    // Outro clique chegou antes e está debitando. A aprovação fica com ele: se o
    // débito dele falhar, esta não pode aprovar uma arte sem crédito.
    if (!reservada?.length) return {};

    let restante = -1;
    try {
      restante = await debitarCredito(peca.cliente_id);
    } catch {
      await supabase.from("pecas").update({ pacote_consumido: false }).eq("id", id);
      return { erro: "Não consegui debitar o crédito. Tente de novo." };
    }
    if (restante < 0) {
      await supabase.from("pecas").update({ pacote_consumido: false }).eq("id", id);
      if (!(socio && form.get("sem_credito") === "sim")) {
        return {
          semCredito: true,
          erro: socio
            ? "O cliente está sem crédito. Registre um plano, ou aprove sem debitar."
            : "O cliente está sem crédito para aprovar. Peça a um sócio para registrar o plano.",
        };
      }
    }
  }

  // Só aprova o que ainda não está aprovado nem voltou para a fila no meio do
  // caminho. O crédito já debitado fica com a peça: a próxima aprovação não cobra.
  const { data: aprovada } = await supabase
    .from("pecas")
    .update({ status: "aprovada", aprovada_em: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "aprovada")
    .neq("status", "pendente")
    .neq("status", "gerando")
    .select("id");

  // Arte aprovada vira referência do cliente: é o material que faz os
  // próximos pedidos saírem mais perto do esperado já na primeira tentativa,
  // reduzindo retrabalho (= custo). Uma vez por aprovação, nunca em dobro.
  if (aprovada?.length) {
    await supabase.from("referencias").insert({
      cliente_id: peca.cliente_id,
      tipo: "arte_aprovada",
      url: peca.imagem_url,
      descricao: peca.titulo,
    });
  }

  revalidatePath(`/pedidos/${peca.pedido_id}`);
  revalidarCobranca(peca.cliente_id);
  return {};
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

  revalidarCobranca(id);
}

// Marca ou desmarca o cliente em teste: alguém que a agência atende para
// experimentar, sem cobrar. Ele produz normalmente, mas sai da receita e das
// cobranças, e o custo dele aparece à parte no painel.
//
// Sair do teste é começar a pagar, então só sai quem tem plano em dia. Sem plano,
// é registrar o primeiro que tira o cliente do teste (ver gravarPlano).
export async function alternarTesteCliente(form: FormData) {
  await requireSocio();
  const supabase = await createClient();
  const id = texto(form, "id");
  if (!id) return;

  const { data: cliente } = await supabase.from("clientes").select("em_teste").eq("id", id).maybeSingle();
  if (!cliente) return;

  if (cliente.em_teste) {
    const { data: planos } = await supabase
      .from("pacotes")
      .select("*")
      .eq("cliente_id", id)
      .eq("tipo", "tempo")
      .neq("status", "cancelado");
    const plano = ultimoPlano((planos ?? []) as Pacote[]);
    if (!plano?.validade || plano.validade < hojeSP()) return;
  }

  await supabase
    .from("clientes")
    .update({ em_teste: !cliente.em_teste, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidarCobranca(id);
}
