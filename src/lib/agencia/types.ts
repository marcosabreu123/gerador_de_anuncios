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
  direcao_arte: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type TipoReferencia = "logo" | "produto" | "arte_aprovada" | "referencia_visual";

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
