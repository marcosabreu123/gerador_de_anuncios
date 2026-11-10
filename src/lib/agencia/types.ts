import type { LeituraDasReferencias } from "@/lib/ai/ler-referencias";
import type { EstiloComunicacao, Formato, IntensidadeVisual, TipoImagem } from "@/lib/types";
import type { ObjetivoArte, TextoObrigatorio } from "./objetivos";
import type { SituacaoCliente } from "./situacao-cliente";

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
  // Produz normalmente, mas fica fora da receita, das cobranças e dos totais do
  // painel (ver schema-gestao-clientes.sql).
  em_teste: boolean;
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

// tempo: plano de 1, 3, 6 ou 12 meses, com os créditos para usar no período (ver
// schema-cobrancas.sql). imagens: pacote avulso, que não vencia. A agência parou de
// vendê-lo; ele só existe nos registros antigos.
export type TipoPacote = "imagens" | "tempo";

export interface Pacote {
  id: string;
  cliente_id: string;
  nome: string;
  tipo: TipoPacote;
  meses: number | null;
  qtd_imagens: number;
  qtd_usadas: number;
  valor_centavos: number;
  status: StatusPacote;
  // Último dia de uso. Sempre preenchida no plano; nula no pacote avulso.
  validade: string | null;
  assinado_em: string;
  created_at: string;
}

export type MetodoPagamento = "pix" | "dinheiro" | "transferencia" | "cartao" | "gateway";
export type StatusPagamento = "pendente" | "confirmado" | "estornado";

// Os que a tela oferece. "gateway" fica para quando houver integração.
export const METODOS_PAGAMENTO: Record<Exclude<MetodoPagamento, "gateway">, string> = {
  pix: "Pix",
  cartao: "Cartão",
  dinheiro: "Dinheiro",
  transferencia: "Transferência",
};

export function rotuloDoMetodo(metodo: string): string {
  return (METODOS_PAGAMENTO as Record<string, string>)[metodo] ?? (metodo === "gateway" ? "Gateway" : metodo);
}

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

// Imagens que dá para anexar a um ajuste. Cada uma soma uns US$ 0,015 e alonga a
// edição, que precisa caber no tempo do worker.
export const MAX_IMAGENS_AJUSTE = 3;

// Cada imagem que a peça já teve. O ajuste troca a arte em uso, mas a anterior pode
// ter ficado melhor: a lista guarda todas para o operador resgatar.
export interface VersaoPeca {
  url: string;
  criadaEm: string;
  formato: Formato;
  // O que o operador pediu para chegar nesta versão. A primeira não tem.
  ajuste?: string;
  // Imagens que ele anexou a esse pedido de ajuste.
  imagensAjuste?: string[];
  // Vira contexto do próximo ajuste quando esta versão volta a ser a da peça.
  promptUsado?: string;
}

export interface BriefingPecaManual {
  prompt: string;
  formato: Formato;
  estilo?: EstiloComunicacao;
  intensidade?: IntensidadeVisual;
  tipoImagem?: TipoImagem;
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
  // O que a arte vai ser e os textos que entram nela exatamente como o operador
  // escreveu (ver objetivos.ts). Sem objetivo, o pedido é livre.
  objetivo?: ObjetivoArte;
  obrigatorios?: TextoObrigatorio[];
  // Peça criada pelo botão "Outro formato": o id da peça cuja arte ela adapta.
  // Enquanto a adaptação não sai, "Tentar de novo" continua adaptando aquela arte.
  adaptadaDe?: string;
  // Ajuste cirúrgico pedido no botão "Ajustar" da peça já entregue. Guarda a
  // arte que o operador está olhando e só o que ele pediu para mudar, porque
  // aqui a geração NÃO recria a peça: edita aquela imagem e preserva o resto.
  //
  // Sem isso, "deixa o preço maior" devolvia uma arte completamente outra —
  // o botão prometia ajuste e entregava recriação.
  ajusteSobreUrl?: string;
  instrucaoAjuste?: string;
  // Imagens anexadas ao pedido de ajuste: um produto, uma pessoa ou um estilo para
  // trazer para a arte. O texto do ajuste diz o que usar de cada uma, e elas valem
  // só para o ajuste em curso.
  imagensAjuste?: string[];
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
  // Já gastou o crédito dela. Uma vez por peça: aprovar de novo não cobra outra vez.
  pacote_consumido: boolean;
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
  situacao: SituacaoCliente;
  em_teste: boolean;
  // Dias desde o último pedido. Nulo para quem nunca pediu.
  dias_sem_pedido: number | null;
  // Pedidos abertos no período.
  pedidos: number;
  // Aprovadas no período. É a arte aprovada que gasta crédito do cliente.
  artes_aprovadas: number;
  // Feitas no período e ainda sem aprovação: trabalho que não virou crédito.
  aguardando_aprovacao: number;
  geracoes: number;
  // O multiplicador que realmente define a margem: quantas imagens foram
  // precisas por arte aprovada, contando as variações que ninguém aprovou.
  geracoes_por_arte: number;
  // Custo de geração: tudo que a OpenAI cobrou pelas chamadas do cliente.
  custo_brl: number;
  receita_brl: number;
  margem_brl: number;
  // Créditos para usar hoje. Nulo para cliente em teste, que não usa crédito.
  creditos: number | null;
}

// Teve alguma coisa no mês: pedido, geração, arte, pagamento. Aqui, e não no
// relatório, porque a tabela do painel roda no navegador e o relatório só no
// servidor.
export function teveMovimento(r: ResumoCustoCliente): boolean {
  return (
    r.pedidos > 0 ||
    r.geracoes > 0 ||
    r.custo_brl > 0 ||
    r.receita_brl > 0 ||
    r.artes_aprovadas > 0 ||
    r.aguardando_aprovacao > 0
  );
}

export function formatarBRL(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function centavosParaBRL(centavos: number): string {
  return formatarBRL(centavos / 100);
}

// Crédito da OpenAI, que é cobrado em dólar: "US$ 6,60".
export function formatarUSD(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "USD" });
}

// Valor digitado em reais ("1.200,00", "300", "34.90") para centavos. Nulo se
// não for um valor positivo. Sem vírgula, ponto seguido de três dígitos é
// milhar, como se escreve aqui: "1.200" é mil e duzentos.
export function reaisParaCentavos(texto: string | null | undefined): number | null {
  let limpo = (texto ?? "").replace(/R\$|\s/g, "");
  if (!/^[\d.,]+$/.test(limpo)) return null;
  if (limpo.includes(",")) limpo = limpo.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) limpo = limpo.replace(/\./g, "");
  const reais = Number(limpo);
  if (!Number.isFinite(reais) || reais <= 0) return null;
  return Math.round(reais * 100);
}

// Centavos no formato do campo de valor: 30000 vira "300,00".
export function centavosParaCampo(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}
