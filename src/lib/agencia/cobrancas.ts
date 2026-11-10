import { diasEntre, somarMeses } from "@/lib/datas";
import { diasDesde, situacaoDoCliente, type SituacaoCliente } from "./situacao-cliente";
import type { Cliente, Pacote, Pagamento, TipoPacote } from "./types";

// Regras dos planos e da situação de cobrança de cada cliente.
//
// Todo cliente que paga tem plano, de 1 mês no mínimo, contado da contratação. A
// agência não vende mais pacote avulso: os que existem ficaram nos registros
// antigos. Cliente em teste é a exceção: não paga, então não tem plano.
//
// Só funções puras: a aba Clientes, a página do cliente, o menu e a rota de
// geração leem os mesmos pacotes e não podem discordar sobre quem está vencido. O
// formulário do plano roda as mesmas contas no navegador para mostrar o
// vencimento antes de salvar.

export const DURACOES_PLANO = [
  { meses: 1, rotulo: "1 mês" },
  { meses: 3, rotulo: "3 meses" },
  { meses: 6, rotulo: "6 meses" },
  { meses: 12, rotulo: "Anual" },
] as const;

export const IMAGENS_POR_PLANO = 10;

// Quantos dias antes do vencimento o cliente passa a aparecer como "vencendo".
export const JANELAS_VENCIMENTO = [7, 15, 30] as const;
export const JANELA_PADRAO = 7;

export function duracaoValida(meses: number): boolean {
  return DURACOES_PLANO.some((d) => d.meses === meses);
}

export function nomeDoPlano(meses: number): string {
  return meses === 12 ? "Plano anual" : `Plano de ${meses} ${meses === 1 ? "mês" : "meses"}`;
}

// O plano novo começa onde a cobertura atual termina: renovar antes do
// vencimento não joga fora os dias que o cliente já pagou.
export function vencimentoDoPlano(assinadoEm: string, meses: number, coberturaAtual: string | null): string {
  const inicio = coberturaAtual && coberturaAtual > assinadoEm ? coberturaAtual : assinadoEm;
  return somarMeses(inicio, meses);
}

// O plano que diz até quando o cliente está coberto: o de vencimento mais
// distante entre os não cancelados. Com a renovação já lançada, é ela, e o
// cliente não aparece como vencendo.
export function ultimoPlano(pacotes: Pacote[]): Pacote | null {
  let ultimo: Pacote | null = null;
  for (const p of pacotes) {
    if (p.tipo !== "tempo" || p.status === "cancelado" || !p.validade) continue;
    if (
      !ultimo ||
      p.validade > ultimo.validade! ||
      (p.validade === ultimo.validade && p.created_at > ultimo.created_at)
    ) {
      ultimo = p;
    }
  }
  return ultimo;
}

// Créditos que dá para usar hoje: pacotes ativos, com saldo e dentro da validade.
// Os créditos do plano vencem com ele. Um pacote avulso antigo, que não vence,
// continuaria valendo.
export function imagensDisponiveis(
  pacotes: Pick<Pacote, "status" | "validade" | "qtd_imagens" | "qtd_usadas">[],
  hoje: string,
): number {
  return pacotes
    .filter((p) => p.status === "ativo" && (!p.validade || p.validade >= hoje))
    .reduce((soma, p) => soma + Math.max(0, p.qtd_imagens - p.qtd_usadas), 0);
}

export type SituacaoPlano = "vencido" | "vencendo" | "em_dia" | "sem_plano";

// `dias` até o vencimento do último plano; nulo quando o cliente não tem plano.
export function situacaoDoPlano(dias: number | null, janela: number): SituacaoPlano {
  if (dias === null) return "sem_plano";
  if (dias < 0) return "vencido";
  return dias <= janela ? "vencendo" : "em_dia";
}

export const SELO_SITUACAO: Record<SituacaoPlano, { rotulo: string; tom: string }> = {
  vencido: { rotulo: "Vencido", tom: "badge-danger" },
  vencendo: { rotulo: "Vencendo", tom: "badge-warning" },
  em_dia: { rotulo: "Em dia", tom: "badge-success" },
  // Todo cliente que paga precisa de plano: sem ele, é pendência.
  sem_plano: { rotulo: "Sem plano", tom: "badge-warning" },
};

export function prazoDoPlano(dias: number): string {
  if (dias === 0) return "Vence hoje";
  if (dias === 1) return "Vence amanhã";
  if (dias > 1) return `Vence em ${dias} dias`;
  if (dias === -1) return "Venceu ontem";
  return `Venceu há ${-dias} dias`;
}

// Como o pacote aparece no histórico do cliente. Só o último plano vencido é
// problema: os anteriores foram renovados, e pintar cada um de vermelho
// transformaria o histórico de um cliente fiel num alarme.
export function seloDoPacote(p: Pacote, hoje: string, ultimoPlanoId: string | null): { rotulo: string; tom: string } {
  if (p.status === "cancelado") return { rotulo: "Cancelado", tom: "" };
  if (p.validade && p.validade < hoje) {
    return p.id === ultimoPlanoId ? { rotulo: "Vencido", tom: "badge-danger" } : { rotulo: "Encerrado", tom: "" };
  }
  if (p.qtd_usadas >= p.qtd_imagens) return { rotulo: "Esgotado", tom: "" };
  if (p.id === ultimoPlanoId && p.validade) {
    const dias = diasEntre(hoje, p.validade);
    if (dias <= JANELA_PADRAO) return { rotulo: prazoDoPlano(dias), tom: "badge-warning" };
  }
  return { rotulo: "Ativo", tom: "badge-success" };
}

// ---------- Preço sugerido no formulário ----------

export function chaveDoPreco(tipo: TipoPacote | undefined, meses: number | null | undefined): string {
  return tipo === "tempo" ? `tempo-${meses}` : "imagens";
}

// Último valor cobrado em cada modalidade. As listas vêm em ordem de prioridade
// (primeiro a do próprio cliente, depois a da agência), cada uma do mais novo
// para o mais antigo.
export function precosSugeridos(
  ...listas: Pick<Pacote, "tipo" | "meses" | "valor_centavos" | "status">[][]
): Record<string, number> {
  const precos: Record<string, number> = {};
  for (const lista of listas) {
    for (const p of lista) {
      if (p.status === "cancelado") continue;
      const chave = chaveDoPreco(p.tipo, p.meses);
      if (!(chave in precos)) precos[chave] = p.valor_centavos;
    }
  }
  return precos;
}

// ---------- Carteira (aba Clientes) ----------

export interface PlanoResumo {
  id: string;
  nome: string;
  meses: number;
  qtdImagens: number;
  valorCentavos: number;
  assinadoEm: string;
  venceEm: string;
}

export type SituacaoPagamento = "pago" | "pendente" | "sem_registro";

export interface LinhaCobranca {
  clienteId: string;
  nome: string;
  nicho: string | null;
  logo: string | null;
  situacao: SituacaoCliente;
  emTeste: boolean;
  // Dias desde o último pedido. Nulo para quem nunca pediu.
  diasSemPedido: number | null;
  plano: PlanoResumo | null;
  // Dias até o vencimento do plano: negativo depois que venceu, nulo sem plano.
  dias: number | null;
  pagamento: SituacaoPagamento;
  // Valor do plano pago, que a coluna "Pagamento" mostra ao lado do "Pago".
  pagoCentavos: number | null;
  // O que o botão "Marcar como pago" confirma: o pagamento em aberto mais antigo.
  pendente: { id: string; valorCentavos: number } | null;
  aReceberCentavos: number;
  imagens: number;
}

export type ClienteDaCarteira = Pick<Cliente, "id" | "nome" | "nicho" | "ativo" | "em_teste" | "created_at">;

function agrupar<T>(itens: T[], chave: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const k = chave(item);
    const grupo = grupos.get(k);
    if (grupo) grupo.push(item);
    else grupos.set(k, [item]);
  }
  return grupos;
}

export function montarLinhas({
  clientes,
  pacotes,
  pagamentos,
  logos,
  ultimos = new Map(),
  hoje,
}: {
  clientes: ClienteDaCarteira[];
  pacotes: Pacote[];
  pagamentos: Pagamento[];
  logos: Map<string, string>;
  // Último pedido de cada cliente (ver ultimosPedidos). Sem ele, a situação conta
  // só pelo cadastro.
  ultimos?: Map<string, string>;
  hoje: string;
}): LinhaCobranca[] {
  const pacotesPor = agrupar(pacotes, (p) => p.cliente_id);
  const pagamentosPor = agrupar(pagamentos, (p) => p.cliente_id);

  return clientes
    .map((c): LinhaCobranca => {
      const dele = pacotesPor.get(c.id) ?? [];
      const pagos = pagamentosPor.get(c.id) ?? [];
      const plano = ultimoPlano(dele);
      const abertos = pagos
        .filter((pg) => pg.status === "pendente")
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      const planoPago = Boolean(plano && pagos.some((pg) => pg.pacote_id === plano.id && pg.status === "confirmado"));
      const ultimo = ultimos.get(c.id) ?? null;

      return {
        clienteId: c.id,
        nome: c.nome,
        nicho: c.nicho,
        logo: logos.get(c.id) ?? null,
        situacao: situacaoDoCliente(c, ultimo, hoje),
        emTeste: Boolean(c.em_teste),
        diasSemPedido: diasDesde(ultimo, hoje),
        plano: plano && {
          id: plano.id,
          nome: plano.nome,
          meses: plano.meses ?? 0,
          qtdImagens: plano.qtd_imagens,
          valorCentavos: plano.valor_centavos,
          assinadoEm: plano.assinado_em,
          venceEm: plano.validade!,
        },
        dias: plano ? diasEntre(hoje, plano.validade!) : null,
        pagamento: abertos.length > 0 ? "pendente" : planoPago ? "pago" : "sem_registro",
        pagoCentavos: planoPago ? plano!.valor_centavos : null,
        pendente: abertos[0] ? { id: abertos[0].id, valorCentavos: abertos[0].valor_centavos } : null,
        aReceberCentavos: abertos.reduce((soma, pg) => soma + pg.valor_centavos, 0),
        imagens: imagensDisponiveis(dele, hoje),
      };
    })
    .sort(ordemDeCobranca);
}

// O que pede ação primeiro: plano vencido, cliente pagante sem plano, depois os
// planos pela data de vencimento. Em teste e arquivados no fim.
function pesoNaCarteira(l: LinhaCobranca): number {
  if (l.situacao === "arquivado") return 4;
  if (l.emTeste) return 3;
  if (l.dias === null) return 1;
  return l.dias < 0 ? 0 : 2;
}

function ordemDeCobranca(a: LinhaCobranca, b: LinhaCobranca): number {
  return (
    pesoNaCarteira(a) - pesoNaCarteira(b) ||
    (a.dias ?? 0) - (b.dias ?? 0) ||
    a.nome.localeCompare(b.nome, "pt-BR")
  );
}

// Filtros da aba Clientes. Aqui, e não no componente, porque a página do
// servidor confere o ?filtro= do endereço e não enxerga valores de um módulo
// "use client".
export const FILTROS_CLIENTES = [
  "todos",
  "vencendo",
  "vencidos",
  "pendentes",
  "sem_plano",
  "em_dia",
  "em_teste",
  "inativos",
  "arquivados",
] as const;
export type FiltroClientes = (typeof FILTROS_CLIENTES)[number];

export function filtroDeClientes(valor: string | undefined): FiltroClientes {
  return (FILTROS_CLIENTES as readonly string[]).includes(valor ?? "") ? (valor as FiltroClientes) : "todos";
}

// Quem pede ação do sócio: plano vencido ou vencendo, pagamento em aberto, ou
// cliente pagante sem plano. Cliente em teste não é cobrado e arquivado saiu da
// carteira.
export function precisaAtencao(linha: LinhaCobranca, janela: number = JANELA_PADRAO): boolean {
  if (linha.emTeste || linha.situacao === "arquivado") return false;
  const situacao = situacaoDoPlano(linha.dias, janela);
  return situacao !== "em_dia" || linha.pagamento === "pendente";
}
