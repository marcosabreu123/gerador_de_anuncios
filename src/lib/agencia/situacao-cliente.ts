import type { SupabaseClient } from "@supabase/supabase-js";
import { diasEntre, hojeSP } from "@/lib/datas";

// Situação de cada cliente na carteira. A lista de clientes e o painel contam do
// mesmo jeito, então a regra fica aqui, em funções puras.
//
// Ativo é quem está pedindo. Inativo é quem parou de pedir, mesmo que ainda tenha
// crédito: é com ele que o sócio precisa falar. Em teste fica à parte, fora da
// receita e das cobranças. Arquivado saiu da carteira.

// Sem pedido por mais que isto, o cliente parou de pedir.
export const DIAS_PARA_INATIVO = 30;

export type SituacaoCliente = "ativo" | "inativo" | "em_teste" | "arquivado";

export interface DadosDaSituacao {
  ativo: boolean;
  em_teste?: boolean | null;
  created_at: string;
}

// Dias de calendário em São Paulo desde o instante. Nulo sem instante.
export function diasDesde(instante: string | null | undefined, hoje: string): number | null {
  if (!instante) return null;
  return Math.max(0, diasEntre(hojeSP(new Date(instante)), hoje));
}

export function situacaoDoCliente(
  cliente: DadosDaSituacao,
  ultimoPedido: string | null | undefined,
  hoje: string,
): SituacaoCliente {
  if (!cliente.ativo) return "arquivado";
  if (cliente.em_teste) return "em_teste";
  // Quem acabou de entrar e ainda não pediu continua ativo: o prazo conta do cadastro.
  const dias = diasDesde(ultimoPedido ?? cliente.created_at, hoje) ?? 0;
  return dias > DIAS_PARA_INATIVO ? "inativo" : "ativo";
}

export function textoDoUltimoPedido(dias: number | null): string {
  if (dias === null) return "Nenhum pedido ainda";
  if (dias === 0) return "Último pedido hoje";
  if (dias === 1) return "Último pedido ontem";
  return `Último pedido há ${dias} dias`;
}

// Filtros da lista de clientes. Aqui, e não no componente, porque a página do
// servidor confere o ?filtro= do endereço e não enxerga valores de um módulo
// "use client".
export const FILTROS_CLIENTES = [
  "todos",
  "ativos",
  "inativos",
  "em_teste",
  "em_producao",
  "sem_credito",
  "arquivados",
] as const;
export type FiltroClientes = (typeof FILTROS_CLIENTES)[number];

export function filtroDeClientes(valor: string | undefined): FiltroClientes {
  return (FILTROS_CLIENTES as readonly string[]).includes(valor ?? "") ? (valor as FiltroClientes) : "todos";
}

// Último pedido de cada cliente, numa consulta só (ver schema-gestao-clientes.sql).
// Sem a função no banco a tela continua de pé, contando só pelo cadastro.
export async function ultimosPedidos(supabase: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await supabase.rpc("ultimo_pedido_por_cliente");
  if (error) {
    console.error("[clientes] erro ao ler o último pedido de cada cliente:", error);
    return new Map();
  }
  const linhas = (data ?? []) as { cliente_id: string; ultimo_pedido_em: string | null }[];
  return new Map(
    linhas.filter((l) => l.ultimo_pedido_em).map((l) => [l.cliente_id, l.ultimo_pedido_em as string]),
  );
}
