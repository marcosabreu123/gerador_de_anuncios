import { diasEntre, somarMeses } from "@/lib/datas";
import type { Pacote, Pagamento, TipoPacote } from "./types";

// Regras dos planos por tempo e da situação de cobrança de cada cliente.
//
// Só funções puras: a tela de cobranças, a do cliente, o menu e a rota de geração
// leem os mesmos pacotes e não podem discordar sobre quem está vencido. O
// formulário de venda roda as mesmas contas no navegador para mostrar o
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

// Imagens que dá para usar hoje: pacotes ativos, com saldo e dentro da validade.
// O pacote avulso não vence, então continua valendo depois que o plano acaba.
export function imagensDisponiveis(pacotes: Pacote[], hoje: string): number {
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
  sem_plano: { rotulo: "Sem plano", tom: "" },
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

// ---------- Carteira (tela de cobranças) ----------

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
  plano: PlanoResumo | null;
  // Dias até o vencimento do plano: negativo depois que venceu, nulo sem plano.
  dias: number | null;
  pagamento: SituacaoPagamento;
  // O que o botão "Marcar como pago" confirma: o pagamento em aberto mais antigo.
  pendente: { id: string; valorCentavos: number } | null;
  aReceberCentavos: number;
  imagens: number;
}

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
  hoje,
}: {
  clientes: { id: string; nome: string; nicho: string | null }[];
  pacotes: Pacote[];
  pagamentos: Pagamento[];
  logos: Map<string, string>;
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

      return {
        clienteId: c.id,
        nome: c.nome,
        nicho: c.nicho,
        logo: logos.get(c.id) ?? null,
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
        pendente: abertos[0] ? { id: abertos[0].id, valorCentavos: abertos[0].valor_centavos } : null,
        aReceberCentavos: abertos.reduce((soma, pg) => soma + pg.valor_centavos, 0),
        imagens: imagensDisponiveis(dele, hoje),
      };
    })
    .sort(ordemDeCobranca);
}

// Quem vence antes vem primeiro, com os vencidos no topo; os sem plano no fim.
function ordemDeCobranca(a: LinhaCobranca, b: LinhaCobranca): number {
  if (a.dias === null || b.dias === null) {
    if (a.dias === b.dias) return a.nome.localeCompare(b.nome, "pt-BR");
    return a.dias === null ? 1 : -1;
  }
  return a.dias - b.dias || a.nome.localeCompare(b.nome, "pt-BR");
}

// Filtros da tela de cobranças. Aqui, e não no componente, porque a página do
// servidor confere o ?filtro= do endereço e não enxerga valores de um módulo
// "use client".
export const FILTROS_COBRANCA = ["todos", "vencendo", "vencidos", "pendentes", "pagos", "em_dia", "sem_plano"] as const;
export type FiltroCobranca = (typeof FILTROS_COBRANCA)[number];

// Quem pede ação do sócio: plano vencido ou vencendo, ou pagamento em aberto.
export function precisaAtencao(linha: LinhaCobranca, janela: number = JANELA_PADRAO): boolean {
  const situacao = situacaoDoPlano(linha.dias, janela);
  return situacao === "vencido" || situacao === "vencendo" || linha.pagamento === "pendente";
}
