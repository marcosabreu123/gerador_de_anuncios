import { citaAlgumTermo, NICHOS } from "@/lib/ai/nichos";

// Datas que vêm aí para um cliente: as do comércio em geral e as do ramo dele.
// A tela de nova geração mostra as próximas, e um clique escreve o pedido de
// data ("Arte de Natal"), que o redator e o diretor de arte já sabem tratar.
//
// Só entram datas firmes. Data que muda de região para região ou que ninguém
// confirma, como a volta às aulas, fica de fora: sugerir data errada é pior do
// que não sugerir.

interface Ocasiao {
  nome: string;
  // O que vai para a caixa do pedido.
  pedido: string;
  inicio: (ano: number) => Date;
  // Campanha que dura um período, como o Novembro Azul. Sem fim, é um dia só.
  fim?: (ano: number) => Date;
  // Sem termos, vale para todo cliente. Com termos, só para o nicho que cita um deles.
  termos?: string[];
  excluir?: string[];
}

export interface DataProxima {
  nome: string;
  pedido: string;
  // "27/11", "18/09 a 25/09" ou "até 30/11", para a etiqueta da tela.
  quando: string;
  doRamo: boolean;
}

const JANELA_DIAS = 60;
const MAXIMO = 5;

function dia(ano: number, mes: number, d: number): Date {
  return new Date(Date.UTC(ano, mes - 1, d));
}

const fixo = (mes: number, d: number) => (ano: number) => dia(ano, mes, d);

// O n-ésimo dia da semana do mês (0 = domingo): o segundo domingo de maio é o Dia das Mães.
function enesimo(ano: number, mes: number, diaSemana: number, n: number): Date {
  const primeiro = dia(ano, mes, 1).getUTCDay();
  return dia(ano, mes, 1 + ((diaSemana - primeiro + 7) % 7) + (n - 1) * 7);
}

// Domingo de Páscoa pelo cálculo gregoriano (Meeus/Jones/Butcher).
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  return dia(ano, mes, ((h + l - 7 * m + 114) % 31) + 1);
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * 86_400_000);
}

const AUTOESCOLA = ["auto escola", "autoescola", "condutores", "cfc", "habilitação", "habilitacao", "cnh", "trânsito", "transito"];
const TRANSITO = [...AUTOESCOLA, ...NICHOS.automotivo.termos];

const OCASIOES: Ocasiao[] = [
  // Comércio em geral
  { nome: "Ano Novo", pedido: "Arte de Ano Novo", inicio: fixo(1, 1) },
  { nome: "Carnaval", pedido: "Arte de Carnaval", inicio: (ano) => somarDias(pascoa(ano), -47) },
  { nome: "Dia da Mulher", pedido: "Arte do Dia da Mulher", inicio: fixo(3, 8) },
  { nome: "Dia do Consumidor", pedido: "Arte do Dia do Consumidor", inicio: fixo(3, 15) },
  { nome: "Páscoa", pedido: "Arte de Páscoa", inicio: pascoa },
  { nome: "Dia do Trabalhador", pedido: "Arte do Dia do Trabalhador", inicio: fixo(5, 1) },
  { nome: "Dia das Mães", pedido: "Arte de Dia das Mães", inicio: (ano) => enesimo(ano, 5, 0, 2) },
  { nome: "Dia dos Namorados", pedido: "Arte de Dia dos Namorados", inicio: fixo(6, 12) },
  { nome: "São João", pedido: "Arte de São João", inicio: fixo(6, 24) },
  { nome: "Dia dos Pais", pedido: "Arte de Dia dos Pais", inicio: (ano) => enesimo(ano, 8, 0, 2) },
  { nome: "Dia do Cliente", pedido: "Arte do Dia do Cliente", inicio: fixo(9, 15) },
  { nome: "Dia das Crianças", pedido: "Arte de Dia das Crianças", inicio: fixo(10, 12) },
  // A sexta depois da quarta quinta-feira de novembro.
  { nome: "Black Friday", pedido: "Arte de Black Friday", inicio: (ano) => somarDias(enesimo(ano, 11, 4, 4), 1) },
  { nome: "Natal", pedido: "Arte de Natal", inicio: fixo(12, 25) },

  // Do ramo
  { nome: "Dia do Churrasco", pedido: "Arte do Dia do Churrasco", inicio: fixo(4, 24), termos: NICHOS.acougue.termos },
  { nome: "Dia do Hambúrguer", pedido: "Arte do Dia do Hambúrguer", inicio: fixo(5, 28), termos: NICHOS.hamburgueria.termos },
  { nome: "Dia da Pizza", pedido: "Arte do Dia da Pizza", inicio: fixo(7, 10), termos: NICHOS.pizzaria.termos },
  { nome: "Dia do Café", pedido: "Arte do Dia Internacional do Café", inicio: fixo(10, 1), termos: NICHOS.padaria.termos },
  { nome: "Dia do Pão", pedido: "Arte do Dia Mundial do Pão", inicio: fixo(10, 16), termos: NICHOS.padaria.termos },
  {
    nome: "Dia do Educador Físico",
    pedido: "Arte do Dia do Profissional de Educação Física",
    inicio: fixo(9, 1),
    termos: NICHOS.fitness.termos,
  },
  {
    nome: "Outubro Rosa",
    pedido: "Arte do Outubro Rosa",
    inicio: fixo(10, 1),
    fim: fixo(10, 31),
    termos: [...NICHOS.saude.termos, ...NICHOS.farmacia.termos, ...NICHOS.fitness.termos, ...NICHOS.beleza.termos],
  },
  {
    nome: "Novembro Azul",
    pedido: "Arte do Novembro Azul",
    inicio: fixo(11, 1),
    fim: fixo(11, 30),
    termos: [...NICHOS.saude.termos, ...NICHOS.farmacia.termos, ...NICHOS.fitness.termos, ...NICHOS.barbearia.termos],
  },
  { nome: "Dia do Médico", pedido: "Arte do Dia do Médico", inicio: fixo(10, 18), termos: ["médico", "medico", "clínica médica", "clinica medica"] },
  { nome: "Dia do Dentista", pedido: "Arte do Dia do Dentista", inicio: fixo(10, 25), termos: ["dentista", "odonto", "odontologia"] },
  { nome: "Dia dos Animais", pedido: "Arte do Dia dos Animais", inicio: fixo(10, 4), termos: NICHOS.pet.termos },
  {
    nome: "Dia do Corretor de Imóveis",
    pedido: "Arte do Dia do Corretor de Imóveis",
    inicio: fixo(8, 27),
    termos: ["imobiliária", "imobiliaria", "imóveis", "imoveis", "corretor de imóveis", "corretor de imoveis"],
  },
  { nome: "Dia do Advogado", pedido: "Arte do Dia do Advogado", inicio: fixo(8, 11), termos: ["advocacia", "advogado", "advogada"] },
  { nome: "Dia do Contador", pedido: "Arte do Dia do Contador", inicio: fixo(9, 22), termos: ["contabilidade", "contador", "contábil", "contabil"] },
  // Autoescola cita "escola" e cairia aqui: professor e estudante não são o público dela.
  { nome: "Dia do Estudante", pedido: "Arte do Dia do Estudante", inicio: fixo(8, 11), termos: NICHOS.educacao.termos, excluir: AUTOESCOLA },
  { nome: "Dia do Professor", pedido: "Arte do Dia do Professor", inicio: fixo(10, 15), termos: NICHOS.educacao.termos, excluir: AUTOESCOLA },
  { nome: "Maio Amarelo", pedido: "Arte do Maio Amarelo", inicio: fixo(5, 1), fim: fixo(5, 31), termos: TRANSITO },
  { nome: "Dia do Motorista", pedido: "Arte do Dia do Motorista", inicio: fixo(7, 25), termos: TRANSITO },
  { nome: "Dia do Motociclista", pedido: "Arte do Dia do Motociclista", inicio: fixo(7, 27), termos: TRANSITO },
  {
    nome: "Semana do Trânsito",
    pedido: "Arte da Semana Nacional de Trânsito",
    inicio: fixo(9, 18),
    fim: fixo(9, 25),
    termos: TRANSITO,
  },
];

// O dia de hoje no fuso da agência, à meia-noite UTC, para comparar com as datas acima.
function hojeEmSaoPaulo(agora: Date): Date {
  const [ano, mes, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })
    .format(agora)
    .split("-")
    .map(Number);
  return dia(ano, mes, d);
}

function ddmm(data: Date): string {
  return `${String(data.getUTCDate()).padStart(2, "0")}/${String(data.getUTCMonth() + 1).padStart(2, "0")}`;
}

function valeParaONicho(ocasiao: Ocasiao, nicho: string): boolean {
  if (!ocasiao.termos) return true;
  return citaAlgumTermo(nicho, ocasiao.termos) && !(ocasiao.excluir && citaAlgumTermo(nicho, ocasiao.excluir));
}

export function datasQueVemAi(nicho: string | null | undefined, agora = new Date()): DataProxima[] {
  const hoje = hojeEmSaoPaulo(agora);
  const limite = somarDias(hoje, JANELA_DIAS);
  const ano = hoje.getUTCFullYear();

  const achadas: (DataProxima & { inicio: Date })[] = [];
  for (const ocasiao of OCASIOES) {
    if (!valeParaONicho(ocasiao, nicho ?? "")) continue;
    // Este ano ou o próximo: em novembro, o Ano Novo que vem é o de janeiro seguinte.
    for (const a of [ano, ano + 1]) {
      const inicio = ocasiao.inicio(a);
      const fim = ocasiao.fim?.(a) ?? inicio;
      if (fim < hoje || inicio > limite) continue;
      const quando = !ocasiao.fim ? ddmm(inicio) : inicio <= hoje ? `até ${ddmm(fim)}` : `${ddmm(inicio)} a ${ddmm(fim)}`;
      achadas.push({ nome: ocasiao.nome, pedido: ocasiao.pedido, quando, doRamo: Boolean(ocasiao.termos), inicio });
      break;
    }
  }

  // As do ramo têm a vaga garantida: são as que o operador menos lembraria sozinho.
  const escolhidas = [
    ...achadas.filter((d) => d.doRamo),
    ...achadas.filter((d) => !d.doRamo).sort((x, y) => x.inicio.getTime() - y.inicio.getTime()),
  ].slice(0, MAXIMO);

  return escolhidas
    .sort((x, y) => x.inicio.getTime() - y.inicio.getTime())
    .map((d) => ({ nome: d.nome, pedido: d.pedido, quando: d.quando, doRamo: d.doRamo }));
}
