"use server";

import { revalidatePath } from "next/cache";
import { requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diaValido, hojeSP } from "@/lib/datas";
import { MAX_DESCRICAO_GASTO, categoriaValida } from "@/lib/agencia/financeiro";
import { reaisParaCentavos } from "@/lib/agencia/types";

// Gastos da agência, lançados pelos sócios. Dinheiro é só do sócio: a tabela
// também só aceita sócio (ver schema-financeiro.sql).

function texto(form: FormData, campo: string): string | null {
  const valor = form.get(campo);
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo.length > 0 ? limpo : null;
}

// O Financeiro e o aviso de saldo da OpenAI no menu, que mora no layout.
function revalidarFinanceiro() {
  revalidatePath("/financeiro");
  revalidatePath("/", "layout");
}

export async function lancarGasto(form: FormData): Promise<{ erro?: string }> {
  const { authId } = await requireSocio();
  const supabase = await createClient();

  const hoje = hojeSP();
  const dia = diaValido(texto(form, "dia")) ?? hoje;
  if (dia > hoje) return { erro: "A data não pode ser depois de hoje." };

  const categoria = texto(form, "categoria");
  if (!categoriaValida(categoria)) return { erro: "Escolha a categoria." };

  const valorCentavos = reaisParaCentavos(texto(form, "valor_reais"));
  if (valorCentavos === null) return { erro: "Informe quanto saiu, em reais." };

  const descricao = texto(form, "descricao");
  if (descricao && descricao.length > MAX_DESCRICAO_GASTO) {
    return { erro: `A descrição passa de ${MAX_DESCRICAO_GASTO} letras. Encurte um pouco.` };
  }

  // O crédito em dólar só existe na recarga da OpenAI. Em branco, o lançamento
  // conta como gasto, mas não entra no saldo estimado de lá.
  let creditoUsd: number | null = null;
  const credito = texto(form, "credito_usd");
  if (categoria === "openai" && credito) {
    const centavos = reaisParaCentavos(credito);
    if (centavos === null || centavos > 10_000_000) {
      return { erro: "Informe o crédito que entrou na OpenAI, em dólares." };
    }
    creditoUsd = centavos / 100;
  }

  const { error } = await supabase.from("gastos").insert({
    dia,
    categoria,
    descricao,
    valor_centavos: valorCentavos,
    credito_usd: creditoUsd,
    registrado_por: authId,
  });
  if (error) {
    console.error("[financeiro] erro ao lançar gasto:", error);
    return { erro: "Não consegui lançar. Tente de novo." };
  }

  revalidarFinanceiro();
  return {};
}

// Remove um lançamento feito por engano. Só gasto: o que entrou vem dos
// pagamentos dos clientes e se corrige na página de cada um.
export async function removerGasto(form: FormData) {
  await requireSocio();
  const supabase = await createClient();
  const id = texto(form, "id");
  if (!id) return;

  const { error } = await supabase.from("gastos").delete().eq("id", id);
  if (error) console.error("[financeiro] erro ao remover gasto:", error);
  revalidarFinanceiro();
}
