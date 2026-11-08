import type { LeituraDasReferencias } from "@/lib/ai/ler-referencias";
import type { EstiloComunicacao, Formato, IntensidadeVisual } from "@/lib/types";

// Tipos do modelo de agência — espelham supabase/schema-agencia.sql.
//
// Diferença central para src/lib/types.ts (modelo antigo): lá, "user" era ao
// mesmo tempo quem loga, quem usa e quem paga. Aqui isso se parte em dois —
// UserRow continua sendo o operador (sócio/designer, que loga) e Cliente é a
// empresa atendida, que não tem conta nenhuma.

export interface Cliente {
  id: string;
  nome: string;
  nicho: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  observacoes: string | null;
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
  updated_at: string;
}

// Identidade visual + regras de negócio do cliente. É o que transforma a
// geração em "no estilo daquela empresa" em vez de genérica.
export interface BrandKit {
  id: string;
  cliente_id: string;
  cores_primarias: string | null;
  cores_secundarias: string | null;
  tipografia: string | null;
  estilo_visual: string | null;
  tom_de_voz: string | null;
  // Tratadas como inegociáveis pelo agente (ver montarContextoCliente).
  regras_obrigatorias: string[];
  regras_proibidas: string[];
  whatsapp: string | null;
  endereco: string | null;
  horario_funcionamento: string | null;
  instagram: string | null;
  // O que a IA entendeu das artes de referência (ver leitura-referencias.ts).
  direcao_arte: LeituraDasReferencias | null;
  created_at: string;
  updated_at: string;
}

export type TipoReferencia = "logo" | "produto" | "arte_aprovada" | "referencia_visual" | "logo_parceiro";

export const TIPOS_REFERENCIA: Record<TipoReferencia, { label: string; ajuda: string }> = {
  logo: {
    label: "Logo da marca",
    ajuda: "Usada para assinar as peças com a identidade do cliente.",
  },
  produto: {
    label: "Foto de produto",
    ajuda: "Produtos reais do cliente, para a arte representar o que ele vende de verdade.",
  },
  arte_aprovada: {
    label: "Arte aprovada",
    ajuda: "Peça que já deu certo. Vira padrão do cliente e reduz tentativa e erro nos próximos pedidos.",
  },
  referencia_visual: {
    label: "Referência visual",
    ajuda: "Inspiração de paleta, clima e estética — nunca copiada literalmente.",
  },
  // A descrição guarda o nome que aciona a logo (ver logo-parceiro.ts).
  logo_parceiro: {
    label: "Logo de parceiro",
    ajuda: "Logo de programa ou parceiro, como a do CNH do Brasil. Entra na arte só quando o pedido citar o nome escrito aqui.",
  },
};

export interface Referencia {
  id: string;
  cliente_id: string;
  tipo: TipoReferencia;
  url: string;
  descricao: string | null;
  created_at: string;
}

export type StatusPacote = "ativo" | "esgotado" | "expirado" | "cancelado";

export interface Pacote {
  id: string;
  cliente_id: string;
  nome: string;
  qtd_imagens: number;
  qtd_usadas: number;
  valor_centavos: number;
  status: StatusPacote;
  validade: string | null;
  created_at: string;
}

export type MetodoPagamento = "pix" | "dinheiro" | "transferencia" | "cartao" | "gateway";
export type StatusPagamento = "pendente" | "confirmado" | "estornado";

export interface Pagamento {
  id: string;
  pacote_id: string | null;
  cliente_id: string;
  valor_centavos: number;
  metodo: MetodoPagamento;
  status: StatusPagamento;
  // Preenchido só quando houver gateway. Nasce nulo no controle manual.
  referencia_externa: string | null;
  pago_em: string | null;
  registrado_por: string | null;
  created_at: string;
}

export type StatusPedido = "rascunho" | "planejado" | "aprovado" | "processando" | "concluido" | "erro";
export type OrigemPedido = "audio" | "texto";

// Uma peça planejada pelo agente, antes de virar imagem. É isso que o
// operador aprova — e aprovar ANTES de gerar é o ponto de controle de custo.
export interface PecaPlanejada {
  titulo: string;
  objetivo: string;
  conteudo: string;
  observacoes?: string;
}

export interface PlanoPedido {
  resumo: string;
  pecas: PecaPlanejada[];
}

// ==== Geração manual (o fluxo de produção) ====
// O operador escreve/fala o que precisa e ajusta os controles; o agente lê o
// perfil do cliente (brand kit, nicho, materiais) e monta a direção de arte.
//
// Substituiu o planejamento automático de lote, que decidia sozinho quantas
// peças fazer e o que cada uma diria. Na prática isso engessava: quem conhece
// o cliente é o operador, e ele quer pedir exatamente o que precisa.

// O que fazer com a imagem que o operador enviou junto do pedido.
// referencia: o pedido manda e a imagem é só inspiração.
// melhoria_recompositiva: mesma campanha, composição claramente melhor.
// nova_versao_criativa: mesmas informações, design recriado do zero.
export type ModoImagemEnviada = "referencia" | "melhoria_recompositiva" | "nova_versao_criativa";

// O que vira o pedido quando o operador manda a arte sem escrever nada.
export const PEDIDO_SEM_TEXTO = {
  melhoria_recompositiva: "Melhorar esta arte",
  nova_versao_criativa: "Criar uma nova versão desta arte",
} as const;

// Quando o operador escreveu, a ordem dele manda no que está na arte enviada.
export function operadorEscreveu(prompt: string): boolean {
  return !Object.values<string>(PEDIDO_SEM_TEXTO).includes(prompt.trim());
}

// Cada imagem que a peça já teve. O ajuste troca a arte em uso, mas a anterior pode
// ter ficado melhor: a lista guarda todas para o operador resgatar.
export interface VersaoPeca {
  url: string;
  criadaEm: string;
  formato: Formato;
  // O que o operador pediu para chegar nesta versão. A primeira não tem.
  ajuste?: string;
  // Vira contexto do próximo ajuste quando esta versão volta a ser a da peça.
  promptUsado?: string;
}

export interface BriefingPecaManual {
  prompt: string;
  formato: Formato;
  estilo?: EstiloComunicacao;
  intensidade?: IntensidadeVisual;
  // Foto de produto escolhida para este pedido (id em `referencias`). Sem ela o
  // produto é composto do zero: o modelo trata o anexo como o produto real da
  // peça, então anexar a foto errada é pior do que não anexar nenhuma.
  produtoRefId?: string;
  // Imagem enviada pelo operador junto do pedido: uma inspiração, a peça antiga do
  // cliente ou algo que ele mandou por WhatsApp. O que a geração faz com ela depende
  // de modoTransformacao.
  //
  // Isso existia numa tela separada (/melhorar) que gerava imagem sem
  // vincular a cliente nenhum, sem consumir pacote e sem aparecer no rateio.
  // Trazido para cá, vira peça normal: cobra do pacote e registra custo.
  arteBaseUrl?: string;
  modoTransformacao?: ModoImagemEnviada;
  // Ajuste cirúrgico pedido no botão "Ajustar" da peça já entregue. Guarda a
  // arte que o operador está olhando e só o que ele pediu para mudar, porque
  // aqui a geração NÃO recria a peça: edita aquela imagem e preserva o resto.
  //
  // Sem isso, "deixa o preço maior" devolvia uma arte completamente outra —
  // o botão prometia ajuste e entregava recriação.
  ajusteSobreUrl?: string;
  instrucaoAjuste?: string;
  // Formato pedido num ajuste. Só vira `formato` quando a arte nova sai: se o ajuste
  // falhar, a peça continua no formato da imagem que ficou.
  formatoNovo?: Formato;
  // Todas as imagens que a peça já teve, da mais antiga à mais nova.
  versoes?: VersaoPeca[];
  // Índice e total da leva: quando se pede mais de uma imagem, cada peça
  // recebe instrução de buscar uma direção criativa diferente das irmãs.
  variacao: number;
  total: number;
}

export interface Pedido {
  id: string;
  cliente_id: string;
  titulo: string | null;
  pedido_original: string | null;
  origem: OrigemPedido;
  audio_url: string | null;
  plano: PlanoPedido | null;
  status: StatusPedido;
  criado_por: string | null;
  aprovado_em: string | null;
  concluido_em: string | null;
  created_at: string;
}

export type StatusPeca = "pendente" | "gerando" | "gerada" | "aprovada" | "rejeitada" | "erro";

export interface Peca {
  id: string;
  pedido_id: string;
  cliente_id: string;
  ordem: number;
  titulo: string | null;
  briefing: Record<string, unknown> | null;
  status: StatusPeca;
  imagem_url: string | null;
  prompt_usado: string | null;
  erro: string | null;
  tempo_operacao_segundos: number | null;
  aprovada_em: string | null;
  created_at: string;
}

export type TipoGeracao = "imagem" | "texto" | "transcricao" | "edicao";

// Uma linha por chamada de API — inclusive as que falharam, porque falha
// também custa e precisa aparecer no rateio.
export interface Geracao {
  id: string;
  peca_id: string | null;
  pedido_id: string | null;
  cliente_id: string | null;
  tipo: TipoGeracao;
  modelo: string;
  qualidade: string | null;
  tamanho: string | null;
  usage_raw: Record<string, unknown> | null;
  custo_usd: number | null;
  cambio_brl: number | null;
  custo_brl: number | null;
  duracao_ms: number | null;
  sucesso: boolean;
  erro: string | null;
  created_at: string;
}

export type TipoJob = "gerar_peca" | "planejar_pedido";
export type StatusJob = "pendente" | "processando" | "concluido" | "erro";

export interface FilaJob {
  id: string;
  tipo: TipoJob;
  referencia_id: string;
  payload: Record<string, unknown> | null;
  status: StatusJob;
  tentativas: number;
  max_tentativas: number;
  erro: string | null;
  agendado_para: string;
  iniciado_em: string | null;
  concluido_em: string | null;
  created_at: string;
}

// ==== Agregações de custo (dashboard) ====

export interface ResumoCustoCliente {
  cliente_id: string;
  cliente_nome: string;
  pecas_entregues: number;
  geracoes: number;
  // O multiplicador que realmente define a margem: quantas chamadas de API
  // foram necessárias por peça entregue.
  geracoes_por_peca: number;
  custo_brl: number;
  receita_brl: number;
  margem_brl: number;
  tempo_operacao_segundos: number;
}

export function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function centavosParaBRL(centavos: number): string {
  return formatarBRL(centavos / 100);
}
