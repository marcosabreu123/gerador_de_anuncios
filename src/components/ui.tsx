import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import { ROTULO_SITUACAO, type SituacaoCliente } from "@/lib/agencia/situacao-cliente";
import type { StatusPeca, StatusPedido } from "@/lib/agencia/types";

// Peças de interface que se repetem nas telas. Nenhuma tem estado, então servem
// tanto em componente de servidor quanto de cliente.

export function Marca() {
  return (
    <span className="flex items-center gap-2.5 font-semibold tracking-tight">
      <span
        aria-hidden="true"
        className="flex items-center justify-center w-7 h-7 rounded-lg text-[13px] font-bold text-[#111114]"
        style={{ background: "var(--gradiente-ia)" }}
      >
        A
      </span>
      Artes IA
    </span>
  );
}

// Tons fixos: a mesma empresa precisa ter sempre a mesma cor, senão o operador
// perde a referência visual quando a lista muda de ordem.
const TONS = ["#3987e5", "#e0703f", "#1fa878", "#d99a1c", "#d9608f", "#8b7df0", "#2fa7c4", "#b58a4a"];

function tomDoNome(nome: string): string {
  let soma = 0;
  for (const letra of nome) soma = (soma * 31 + letra.charCodeAt(0)) >>> 0;
  return TONS[soma % TONS.length];
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return `${partes[0]?.[0] ?? "?"}${ultima}`.toUpperCase();
}

export function Avatar({
  nome,
  src,
  tamanho = 36,
}: {
  nome: string;
  src?: string | null;
  tamanho?: number;
}) {
  const medida = { width: tamanho, height: tamanho };

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        // Em px: padding em % conta sobre a largura do pai e sumiria com a logo.
        style={{ ...medida, padding: Math.round(tamanho * 0.08) }}
        className="rounded-[28%] object-contain bg-white border border-[var(--border)] shrink-0"
      />
    );
  }

  const tom = tomDoNome(nome);
  return (
    <span
      aria-hidden="true"
      className="flex items-center justify-center rounded-[28%] font-semibold shrink-0"
      style={{
        ...medida,
        fontSize: tamanho * 0.36,
        color: tom,
        background: `color-mix(in srgb, ${tom} 16%, transparent)`,
      }}
    >
      {iniciais(nome)}
    </span>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  voltar,
  inicio,
  acoes,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  voltar?: { href: string; rotulo: string };
  inicio?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {voltar && (
          <Link
            href={voltar.href}
            className="inline-flex items-center gap-1.5 text-[13px] text-[var(--muted)] hover:text-[var(--foreground)] mb-3 transition-colors"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {voltar.rotulo}
          </Link>
        )}
        <div className="flex items-center gap-3.5 min-w-0">
          {inicio}
          <div className="min-w-0">
            <h1 className="text-2xl lg:text-[28px] font-semibold tracking-[-0.025em] leading-tight">
              {titulo}
            </h1>
            {descricao && <p className="text-sm text-[var(--muted)] mt-1">{descricao}</p>}
          </div>
        </div>
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2 shrink-0">{acoes}</div>}
    </header>
  );
}

export function TituloCard({
  titulo,
  descricao,
  acoes,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-[-0.01em]">{titulo}</h2>
        {descricao && <p className="text-[13px] text-[var(--muted)] mt-0.5">{descricao}</p>}
      </div>
      {acoes}
    </div>
  );
}

export function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  acao?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center gap-3 px-6 py-14">
      <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-[var(--surface-muted)] text-[var(--muted)]">
        <Icone size={20} aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold">{titulo}</p>
        <p className="text-sm text-[var(--muted)] mt-1 max-w-sm">{descricao}</p>
      </div>
      {acao}
    </div>
  );
}

const SELOS: Record<StatusPedido | StatusPeca, { rotulo: string; tom: string }> = {
  rascunho: { rotulo: "Rascunho", tom: "" },
  planejado: { rotulo: "Planejado", tom: "" },
  aprovado: { rotulo: "Na fila", tom: "" },
  processando: { rotulo: "Produzindo", tom: "badge-accent" },
  concluido: { rotulo: "Concluído", tom: "badge-success" },
  pendente: { rotulo: "Na fila", tom: "" },
  gerando: { rotulo: "Gerando", tom: "badge-accent" },
  gerada: { rotulo: "Pronta", tom: "badge-accent" },
  aprovada: { rotulo: "Aprovada", tom: "badge-success" },
  rejeitada: { rotulo: "Rejeitada", tom: "badge-danger" },
  erro: { rotulo: "Erro", tom: "badge-danger" },
};

export function SeloStatus({ status }: { status: StatusPedido | StatusPeca }) {
  const selo = SELOS[status];
  return <span className={`badge shrink-0 ${selo.tom}`}>{selo.rotulo}</span>;
}

// Verde para quem está pedindo, cinza para quem parou, azul para o teste. O
// arquivado é só o contorno. A cor nunca anda sozinha: a legenda e a dica dizem
// o nome da situação.
const COR_SITUACAO: Record<SituacaoCliente, string> = {
  ativo: "bg-[var(--success)]",
  inativo: "bg-[var(--muted)]",
  em_teste: "bg-[var(--accent)]",
  arquivado: "border-[1.5px] border-[var(--muted)]",
};

export function PontoSituacao({ situacao, dica }: { situacao: SituacaoCliente; dica?: string }) {
  const texto = dica ?? ROTULO_SITUACAO[situacao];
  return (
    <span
      role="img"
      aria-label={texto}
      title={texto}
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${COR_SITUACAO[situacao]}`}
    />
  );
}

export function LegendaSituacao({ situacoes }: { situacoes: SituacaoCliente[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]" aria-label="Legenda">
      {situacoes.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${COR_SITUACAO[s]}`} />
          {ROTULO_SITUACAO[s]}
        </li>
      ))}
    </ul>
  );
}
