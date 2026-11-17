import { TIPOS_REFERENCIA, type TipoReferencia } from "./types";

// O cadastro conversado: o sócio fala com a IA, ela preenche a ficha e só o
// clique em cadastrar grava alguma coisa. Este arquivo é o que a tela, a rota e a
// action dividem, por isso não importa nada de servidor.

export const CAMPOS_FICHA = [
  "nome",
  "nicho",
  "sobre",
  "contato_nome",
  "contato_telefone",
  "cores_primarias",
  "cores_secundarias",
  "tipografia",
  "tom_de_voz",
  "estilo_visual",
  "regras_obrigatorias",
  "regras_proibidas",
  "whatsapp",
  "endereco",
  "horario_funcionamento",
  "instagram",
] as const;

export type CampoFicha = (typeof CAMPOS_FICHA)[number];

// As regras ficam em texto, uma por linha, como no formulário da identidade: guardar
// lista na tela impedia o Enter de abrir linha nova. Vira lista só na hora de gravar.
export type FichaCadastro = Record<CampoFicha, string>;

export const CAMPOS_DE_LISTA: readonly CampoFicha[] = ["regras_obrigatorias", "regras_proibidas"];

export const FICHA_VAZIA: FichaCadastro = Object.fromEntries(CAMPOS_FICHA.map((c) => [c, ""])) as FichaCadastro;

// Limites largos: servem para o modelo não despejar texto, não para apertar o operador.
export const LIMITE_CAMPO: Record<CampoFicha, number> = {
  nome: 120,
  nicho: 80,
  sobre: 600,
  contato_nome: 80,
  contato_telefone: 40,
  cores_primarias: 160,
  cores_secundarias: 160,
  tipografia: 240,
  tom_de_voz: 240,
  estilo_visual: 300,
  regras_obrigatorias: 1500,
  regras_proibidas: 1500,
  whatsapp: 80,
  endereco: 200,
  horario_funcionamento: 160,
  instagram: 80,
};

export const MAX_REGRAS = 12;

// Mais que isso pesa na conversa e no cadastro; quem tem mais materiais completa
// depois, na página do cliente.
export const MAX_ANEXOS = 12;

export type TipoMaterial = TipoReferencia | "descartar";

export const ROTULO_MATERIAL: Record<TipoMaterial, string> = {
  ...Object.fromEntries(Object.entries(TIPOS_REFERENCIA).map(([tipo, { label }]) => [tipo, label])),
  descartar: "Não usar",
} as Record<TipoMaterial, string>;

export function tipoMaterialValido(valor: unknown): TipoMaterial | null {
  return typeof valor === "string" && Object.hasOwn(ROTULO_MATERIAL, valor) ? (valor as TipoMaterial) : null;
}

export interface AnexoCadastro {
  id: string;
  url: string;
  // Nulo até a IA ver a imagem.
  tipo: TipoMaterial | null;
  // Na logo de parceiro, o nome que aciona a logo no pedido.
  descricao: string;
  // Cores medidas na imagem, com a área de cada uma. Medidas uma vez: é por elas que
  // a IA lembra da imagem nas rodadas seguintes, sem recebê-la de novo.
  paleta: string[];
  // A IA ainda não viu.
  nova: boolean;
  // O operador escolheu o tipo à mão, e a IA não muda mais.
  editado: boolean;
  // Logo recortada pela IA de outra imagem.
  recorte?: boolean;
}

export interface MensagemCadastro {
  id: string;
  papel: "operador" | "ia";
  texto: string;
  anexos: string[];
  audio?: boolean;
  // Quantos campos da ficha a IA mudou nesta resposta. No celular a ficha fica em
  // outra aba, e a mensagem leva até ela.
  alterou?: number;
}

export interface MaterialClassificado {
  id: string;
  tipo: TipoMaterial;
  descricao: string;
}

export interface RespostaCadastro {
  resposta: string;
  // Só os campos que mudaram nesta rodada.
  alteracoes: Partial<FichaCadastro>;
  materiais: MaterialClassificado[];
  paletas: Record<string, string[]>;
  novosAnexos: AnexoCadastro[];
  faltando: string[];
  // Imagens novas que o servidor não conseguiu abrir: saem da ficha, e o sócio manda de novo.
  naoAbriram: string[];
  // O que o áudio disse, para aparecer na conversa como mensagem do operador.
  transcricao?: string;
}

function textoLimpo(valor: unknown, limite: number): string {
  if (typeof valor !== "string") return "";
  return valor.replace(/\r/g, "").trim().slice(0, limite);
}

// Regras chegam como lista (do modelo) ou como texto de uma por linha (da tela).
function regrasEmTexto(valor: unknown): string {
  const linhas = Array.isArray(valor)
    ? valor.filter((x): x is string => typeof x === "string")
    : typeof valor === "string"
      ? valor.split("\n")
      : [];
  return linhas
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim().slice(0, 200))
    .filter(Boolean)
    .slice(0, MAX_REGRAS)
    .join("\n");
}

export function valorDoCampo(campo: CampoFicha, valor: unknown): string {
  return CAMPOS_DE_LISTA.includes(campo) ? regrasEmTexto(valor) : textoLimpo(valor, LIMITE_CAMPO[campo]);
}

// Ficha que veio da tela: só os campos conhecidos, cada um no limite.
export function fichaValida(bruta: unknown): FichaCadastro {
  const objeto = bruta && typeof bruta === "object" ? (bruta as Record<string, unknown>) : {};
  return Object.fromEntries(CAMPOS_FICHA.map((c) => [c, valorDoCampo(c, objeto[c])])) as FichaCadastro;
}

// Alterações que vieram do modelo: só campos conhecidos. Campo vazio vale, porque
// o operador pode pedir para apagar.
export function alteracoesValidas(brutas: unknown): Partial<FichaCadastro> {
  if (!brutas || typeof brutas !== "object") return {};
  const objeto = brutas as Record<string, unknown>;
  const alteracoes: Partial<FichaCadastro> = {};
  for (const campo of CAMPOS_FICHA) {
    if (!Object.hasOwn(objeto, campo)) continue;
    const valor = objeto[campo];
    if (valor === null || valor === undefined) continue;
    alteracoes[campo] = valorDoCampo(campo, valor);
  }
  return alteracoes;
}

export function regrasEmLista(texto: string): string[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

// "i3" é a imagem 3 que o sócio mandou; "r3" é a logo que o app recortou dela.
export function idAnexoValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^[ir]\d{1,3}$/.test(valor);
}

// Só imagens que o próprio sócio subiu (ou que o app recortou para ele) no Storage:
// a rota baixa estas URLs, e URL de fora viraria pedido do servidor para qualquer
// endereço.
export function urlDoSocio(url: unknown, prefixo: string): url is string {
  if (typeof url !== "string" || !url.startsWith(prefixo)) return false;
  return /^[\w/.-]+$/.test(url.slice(prefixo.length)) && !url.includes("..");
}

export function anexosValidos(bruto: unknown, prefixo: string): AnexoCadastro[] {
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  return bruto.slice(0, MAX_ANEXOS + 4).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const a = item as Record<string, unknown>;
    if (!idAnexoValido(a.id) || vistos.has(a.id) || !urlDoSocio(a.url, prefixo)) return [];
    vistos.add(a.id);
    return [
      {
        id: a.id,
        url: a.url,
        tipo: tipoMaterialValido(a.tipo),
        descricao: textoLimpo(a.descricao, 120),
        paleta: Array.isArray(a.paleta)
          ? a.paleta.filter((p): p is string => typeof p === "string").map((p) => p.slice(0, 16)).slice(0, 6)
          : [],
        nova: a.nova === true,
        editado: a.editado === true,
        recorte: a.recorte === true,
      },
    ];
  });
}

export function mensagensValidas(bruto: unknown, maximo: number): MensagemCadastro[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.slice(-maximo).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const m = item as Record<string, unknown>;
    if (m.papel !== "operador" && m.papel !== "ia") return [];
    return [
      {
        id: "",
        papel: m.papel,
        texto: textoLimpo(m.texto, 3000),
        anexos: Array.isArray(m.anexos) ? m.anexos.filter(idAnexoValido).slice(0, MAX_ANEXOS) : [],
      },
    ];
  });
}

// Sessão do cadastro: marca o custo da conversa até o cliente existir.
export function sessaoValida(valor: unknown): string | null {
  return typeof valor === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)
    ? valor
    : null;
}
