"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Avatar, PontoSituacao } from "@/components/ui";
import { ROTULO_SITUACAO, textoDoUltimoPedido, ultimoPedidoCurto } from "@/lib/agencia/situacao-cliente";
import { formatarBRL, teveMovimento, type ResumoCustoCliente } from "@/lib/agencia/types";

// A tabela mais importante do painel: o mês de cada cliente numa linha. Os
// pagantes vêm primeiro, depois os clientes em teste (que não pagam: o custo
// deles é da agência) e, se tiveram alguma coisa no mês, os arquivados. Cada
// grupo fecha com a própria linha de total. Quem não teve nada no mês aparece em
// cinza. Clicar no nome de uma coluna ordena.

const decimal = (valor: number) =>
  valor.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Os números que a linha de total também mostra. Nulo quando não se aplica (a
// receita de quem está em teste, a margem sem receita).
interface Numeros {
  pedidos: number;
  aprovadas: number;
  prontas: number;
  geracoes: number;
  custo: number;
  receita: number | null;
  creditos: number | null;
}

const imgPorArte = (n: Numeros) => (n.aprovadas > 0 ? n.geracoes / n.aprovadas : null);
const custoPorArte = (n: Numeros) => (n.aprovadas > 0 ? n.custo / n.aprovadas : null);
const margem = (n: Numeros) => (n.receita === null ? null : n.receita - n.custo);
const margemPct = (n: Numeros) => (n.receita ? ((n.receita - n.custo) / n.receita) * 100 : null);

function numerosDe(r: ResumoCustoCliente): Numeros {
  return {
    pedidos: r.pedidos,
    aprovadas: r.artes_aprovadas,
    prontas: r.aguardando_aprovacao,
    geracoes: r.geracoes,
    custo: r.custo_brl,
    // Cliente em teste não paga: receita e margem não se aplicam.
    receita: r.em_teste ? null : r.receita_brl,
    creditos: r.creditos,
  };
}

function somar(linhas: ResumoCustoCliente[], comReceita: boolean): Numeros {
  const total: Numeros = { pedidos: 0, aprovadas: 0, prontas: 0, geracoes: 0, custo: 0, receita: 0, creditos: 0 };
  for (const r of linhas) {
    total.pedidos += r.pedidos;
    total.aprovadas += r.artes_aprovadas;
    total.prontas += r.aguardando_aprovacao;
    total.geracoes += r.geracoes;
    total.custo += r.custo_brl;
    total.receita! += r.em_teste ? 0 : r.receita_brl;
    total.creditos! += r.creditos ?? 0;
  }
  if (!comReceita) {
    total.receita = null;
    total.creditos = null;
  }
  return total;
}

type Chave =
  | "cliente"
  | "pedidos"
  | "aprovadas"
  | "prontas"
  | "img"
  | "custoArte"
  | "custo"
  | "receita"
  | "margem"
  | "margemPct"
  | "creditos"
  | "ultimo";

interface Coluna {
  chave: Chave;
  rotulo: string;
  dica: string;
  // O valor que ordena. Nulo vai sempre para o fim.
  valor: (r: ResumoCustoCliente) => number | string | null;
  // Maior primeiro no primeiro clique: é o que se procura em custo e margem.
  descendente: boolean;
}

const COLUNAS: Coluna[] = [
  { chave: "cliente", rotulo: "Cliente", dica: "Ordenar pelo nome", valor: (r) => r.cliente_nome, descendente: false },
  { chave: "pedidos", rotulo: "Pedidos", dica: "Pedidos abertos no mês", valor: (r) => r.pedidos, descendente: true },
  {
    chave: "aprovadas",
    rotulo: "Aprovadas",
    dica: "Artes aprovadas no mês. Cada uma usa 1 crédito.",
    valor: (r) => r.artes_aprovadas,
    descendente: true,
  },
  {
    chave: "prontas",
    rotulo: "Prontas",
    dica: "Feitas no mês e ainda sem aprovação",
    valor: (r) => r.aguardando_aprovacao,
    descendente: true,
  },
  {
    chave: "img",
    rotulo: "Img/arte",
    dica: "Imagens geradas por arte aprovada, contando variações, ajustes e falhas. 1 é acertar de primeira.",
    valor: (r) => imgPorArte(numerosDe(r)),
    descendente: true,
  },
  {
    chave: "custoArte",
    rotulo: "Custo/arte",
    dica: "Custo de geração do mês dividido pelas artes aprovadas",
    valor: (r) => custoPorArte(numerosDe(r)),
    descendente: true,
  },
  {
    chave: "custo",
    rotulo: "Custo",
    dica: "Custo de geração do mês, com falhas e variações",
    valor: (r) => r.custo_brl,
    descendente: true,
  },
  {
    chave: "receita",
    rotulo: "Receita",
    dica: "Pagamentos confirmados no mês",
    valor: (r) => numerosDe(r).receita,
    descendente: true,
  },
  {
    chave: "margem",
    rotulo: "Margem",
    dica: "Receita menos o custo de geração",
    valor: (r) => margem(numerosDe(r)),
    descendente: true,
  },
  {
    chave: "margemPct",
    rotulo: "Margem %",
    dica: "Quanto da receita sobrou depois do custo de geração",
    valor: (r) => margemPct(numerosDe(r)),
    descendente: true,
  },
  {
    chave: "creditos",
    rotulo: "Créditos",
    dica: "Créditos para usar hoje. Cliente em teste não usa crédito.",
    valor: (r) => r.creditos,
    descendente: false,
  },
  {
    chave: "ultimo",
    rotulo: "Último pedido",
    dica: "Dias desde o último pedido",
    // Quem nunca pediu é o mais parado de todos.
    valor: (r) => r.dias_sem_pedido ?? Number.MAX_SAFE_INTEGER,
    descendente: true,
  },
];

interface Ordem {
  chave: Chave;
  descendente: boolean;
}

function comparar(coluna: Coluna, ordem: Ordem) {
  return (a: ResumoCustoCliente, b: ResumoCustoCliente) => {
    const va = coluna.valor(a);
    const vb = coluna.valor(b);
    if (va === null || vb === null) {
      if (va === vb) return a.cliente_nome.localeCompare(b.cliente_nome, "pt-BR");
      return va === null ? 1 : -1;
    }
    const base = typeof va === "string" ? va.localeCompare(String(vb), "pt-BR") : va - (vb as number);
    return (ordem.descendente ? -base : base) || a.cliente_nome.localeCompare(b.cliente_nome, "pt-BR");
  };
}

export default function TabelaPorCliente({ resumos }: { resumos: ResumoCustoCliente[] }) {
  const [ordem, setOrdem] = useState<Ordem>({ chave: "custo", descendente: true });

  const grupos = useMemo(() => {
    const coluna = COLUNAS.find((c) => c.chave === ordem.chave)!;
    const ordenar = (linhas: ResumoCustoCliente[]) => [...linhas].sort(comparar(coluna, ordem));
    return [
      {
        id: "pagantes",
        titulo: "Pagantes",
        nota: null,
        linhas: ordenar(resumos.filter((r) => !r.em_teste && r.situacao !== "arquivado")),
        comReceita: true,
      },
      {
        id: "teste",
        titulo: "Em teste",
        nota: "Não pagam: o custo é da agência",
        linhas: ordenar(resumos.filter((r) => r.situacao === "em_teste")),
        comReceita: false,
      },
      {
        id: "arquivados",
        titulo: "Arquivados",
        nota: "Só os que tiveram alguma coisa no mês",
        linhas: ordenar(resumos.filter((r) => r.situacao === "arquivado")),
        comReceita: true,
      },
    ].filter((g) => g.linhas.length > 0);
  }, [resumos, ordem]);

  function ordenarPor(coluna: Coluna) {
    setOrdem((atual) =>
      atual.chave === coluna.chave
        ? { chave: coluna.chave, descendente: !atual.descendente }
        : { chave: coluna.chave, descendente: coluna.descendente },
    );
  }

  return (
    <div className="overflow-x-auto -mx-5">
      <table className="w-full min-w-[1040px] text-sm">
        <thead>
          <tr className="text-[13px] text-[var(--muted)] whitespace-nowrap">
            {COLUNAS.map((c, i) => {
              const ativa = ordem.chave === c.chave;
              const Seta = ordem.descendente ? ArrowDown : ArrowUp;
              return (
                <th
                  key={c.chave}
                  scope="col"
                  aria-sort={ativa ? (ordem.descendente ? "descending" : "ascending") : undefined}
                  className={`py-2 font-medium ${
                    i === 0
                      ? "pl-5 pr-3 text-left sticky left-0 z-10 bg-[var(--surface)]"
                      : `px-2 text-right ${i === COLUNAS.length - 1 ? "pr-5" : ""}`
                  }`}
                >
                  {/* A seta fica fora do fluxo, no espaço entre as colunas: reservar
                      lugar para ela em cada cabeçalho alargava a tabela além da tela. */}
                  <button
                    type="button"
                    onClick={() => ordenarPor(c)}
                    title={c.dica}
                    className={`relative rounded-md hover:text-[var(--foreground)] transition-colors ${
                      ativa ? "text-[var(--foreground)]" : ""
                    }`}
                  >
                    {c.rotulo}
                    {ativa && (
                      <Seta
                        size={12}
                        aria-hidden="true"
                        className={`absolute top-1/2 -translate-y-1/2 ${i === 0 ? "left-full ml-1" : "right-full mr-1"}`}
                      />
                    )}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        {grupos.map((g) => (
          <tbody key={g.id} className="tabular-nums">
            <tr className="border-t border-[var(--border)] bg-[var(--surface-muted)]">
              <th
                scope="colgroup"
                colSpan={COLUNAS.length}
                className="py-1.5 pl-5 pr-3 text-left text-xs font-semibold text-[var(--muted)]"
              >
                <span className="sticky left-5">
                  {g.titulo} · {g.linhas.length}
                  {g.nota && <span className="font-normal"> · {g.nota}</span>}
                </span>
              </th>
            </tr>
            {g.linhas.map((r) => (
              <LinhaCliente key={r.cliente_id} resumo={r} />
            ))}
            <LinhaTotal numeros={somar(g.linhas, g.comReceita)} rotulo={`Total ${g.titulo.toLowerCase()}`} />
          </tbody>
        ))}
      </table>
    </div>
  );
}

function LinhaCliente({ resumo: r }: { resumo: ResumoCustoCliente }) {
  const n = numerosDe(r);
  // Sem nada no mês, a linha fica em cinza: o cliente continua à vista, sem
  // disputar atenção com quem produziu.
  const parado = !teveMovimento(r);
  const ultimo = textoDoUltimoPedido(r.dias_sem_pedido);

  return (
    <tr
      className={`group border-t border-[var(--border)] hover:bg-[var(--surface-muted)] transition-colors ${
        parado ? "text-[var(--muted)]" : ""
      }`}
    >
      <td className="py-2 pl-5 pr-3 sticky left-0 z-10 bg-[var(--surface)] group-hover:bg-[var(--surface-muted)] transition-colors max-w-[260px]">
        {/* No celular o avatar sai e o nome encurta: a coluna fixa ocupava 260
            dos 340px da tela e quase não sobrava lugar para os números rolarem. */}
        <Link
          href={`/clientes/${r.cliente_id}`}
          className="flex items-center gap-2.5 min-w-0 max-w-[8.5rem] sm:max-w-none font-medium"
        >
          <PontoSituacao situacao={r.situacao} dica={`${ROTULO_SITUACAO[r.situacao]}. ${ultimo}.`} />
          <span className="hidden sm:contents">
            <Avatar nome={r.cliente_nome} tamanho={26} />
          </span>
          <span className="truncate hover:underline" title={r.cliente_nome}>
            {r.cliente_nome}
          </span>
        </Link>
      </td>
      <Celula>{n.pedidos}</Celula>
      <Celula>{n.aprovadas}</Celula>
      <Celula>{n.prontas}</Celula>
      <Celula>{fmtDecimal(imgPorArte(n))}</Celula>
      <Celula>{fmtBRL(custoPorArte(n))}</Celula>
      <Celula>{formatarBRL(n.custo)}</Celula>
      <Celula>{fmtBRL(n.receita)}</Celula>
      <Margem valor={margem(n)} />
      <Celula>{fmtPct(margemPct(n))}</Celula>
      <Celula>
        {n.creditos === null ? (
          <span className="text-[var(--muted)]" title="Cliente em teste não usa crédito">
            —
          </span>
        ) : (
          <span className={n.creditos === 0 && r.situacao !== "arquivado" ? "text-[var(--danger)] font-medium" : ""}>
            {n.creditos}
          </span>
        )}
      </Celula>
      <Celula ultima>
        <span
          className={r.situacao === "inativo" ? "text-[var(--warning)] font-medium" : ""}
          title={ultimo}
        >
          {ultimoPedidoCurto(r.dias_sem_pedido)}
        </span>
      </Celula>
    </tr>
  );
}

function LinhaTotal({ numeros: n, rotulo }: { numeros: Numeros; rotulo: string }) {
  return (
    <tr className="border-t border-[var(--border-strong)] font-semibold">
      <td className="py-2 pl-5 pr-3 sticky left-0 z-10 bg-[var(--surface)] text-[13px]">{rotulo}</td>
      <Celula>{n.pedidos}</Celula>
      <Celula>{n.aprovadas}</Celula>
      <Celula>{n.prontas}</Celula>
      <Celula>{fmtDecimal(imgPorArte(n))}</Celula>
      <Celula>{fmtBRL(custoPorArte(n))}</Celula>
      <Celula>{formatarBRL(n.custo)}</Celula>
      <Celula>{fmtBRL(n.receita)}</Celula>
      <Margem valor={margem(n)} />
      <Celula>{fmtPct(margemPct(n))}</Celula>
      <Celula>{n.creditos ?? "—"}</Celula>
      <Celula ultima>
        <span className="text-[var(--muted)] font-normal">—</span>
      </Celula>
    </tr>
  );
}

function Celula({ children, ultima = false }: { children: React.ReactNode; ultima?: boolean }) {
  return <td className={`py-2 px-2 text-right whitespace-nowrap ${ultima ? "pr-5" : ""}`}>{children}</td>;
}

function Margem({ valor }: { valor: number | null }) {
  return (
    <td className={`py-2 px-2 text-right whitespace-nowrap ${valor !== null && valor < 0 ? "text-[var(--danger)]" : ""}`}>
      {fmtBRL(valor)}
    </td>
  );
}

const fmtBRL = (v: number | null) => (v === null ? "—" : formatarBRL(v));
const fmtDecimal = (v: number | null) => (v === null ? "—" : decimal(v));
const fmtPct = (v: number | null) => (v === null ? "—" : `${Math.round(v)}%`);
