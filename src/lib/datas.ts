// Datas de calendário no fuso de São Paulo, como texto AAAA-MM-DD.
//
// Vencimento é um dia, não um instante: o plano que vence em 10/12 vale o dia 10
// inteiro no relógio de quem atende. Em UTC, depois das 21h a data já virou e o
// plano venceria três horas antes. O banco usa o mesmo dia (schema-cobrancas.sql).

const PARTES_SP = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function hojeSP(agora: Date = new Date()): string {
  const partes = Object.fromEntries(PARTES_SP.formatToParts(agora).map((p) => [p.type, p.value]));
  return `${partes.year}-${partes.month}-${partes.day}`;
}

// Aceita só um dia que existe: "2026-02-30" volta nulo.
export function diaValido(texto: string | null | undefined): string | null {
  if (!texto || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return null;
  const data = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().slice(0, 10) === texto ? texto : null;
}

// O mesmo dia N meses depois. Se o mês de chegada não tem esse dia, fica o
// último dele: 31/01 + 1 mês = 28/02 (29 no ano bissexto).
export function somarMeses(dia: string, meses: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  const ultimoDoMes = new Date(Date.UTC(ano, mes - 1 + meses + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes - 1 + meses, Math.min(d, ultimoDoMes))).toISOString().slice(0, 10);
}

// Dias de `de` até `ate`. Negativo quando `ate` já passou.
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000);
}

export function formatarDia(dia: string): string {
  const [ano, mes, d] = dia.split("-");
  return `${d}/${mes}/${ano}`;
}
