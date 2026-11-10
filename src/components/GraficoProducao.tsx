import type { ProducaoDoDia } from "@/lib/agencia/relatorio";

const ALTURA_PX = 208;

// Teto par para o eixo: a linha do meio é teto / 2 e precisa ser um número
// inteiro, senão aparece "7,5 artes" numa grade de artes inteiras.
function tetoDoEixo(maior: number): number {
  const passo = maior <= 20 ? 2 : maior <= 100 ? 10 : 50;
  return Math.max(4, Math.ceil(maior / passo) * passo);
}

function plural(artes: number): string {
  return artes === 1 ? "1 arte" : `${artes} artes`;
}

// Colunas finas numa série só: quantas artes foram aprovadas em cada dia do mês. A dica
// abre no hover e no foco; a tabela logo abaixo dá o mesmo dado sem mouse.
export default function GraficoProducao({ dias, hoje }: { dias: ProducaoDoDia[]; hoje: number }) {
  const maior = Math.max(...dias.map((d) => d.artes));
  const teto = tetoDoEixo(maior);
  const marcas = [teto, teto / 2, 0];

  return (
    <figure className="flex flex-col gap-2">
      <div className="flex gap-2">
        <div className="relative w-6 shrink-0 text-right" style={{ height: ALTURA_PX }} aria-hidden="true">
          {marcas.map((m) => (
            <span
              key={m}
              className="absolute right-0 text-[11px] text-[var(--muted)] tabular-nums leading-none"
              style={{ bottom: `calc(${(m / teto) * 100}% - 5px)` }}
            >
              {m}
            </span>
          ))}
        </div>

        <div className="relative flex-1 min-w-0" style={{ height: ALTURA_PX }}>
          {marcas.map((m) => (
            <div
              key={m}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-[var(--border)]"
              style={{ bottom: `${(m / teto) * 100}%` }}
            />
          ))}

          <div
            className="absolute inset-0 grid"
            style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}
          >
            {dias.map((d, i) => {
              const altura = (d.artes / teto) * 100;
              // Nas pontas a dica abre para dentro, senão sai do card.
              const lado =
                i < 3 ? "left-0" : i > dias.length - 4 ? "right-0" : "left-1/2 -translate-x-1/2";

              return (
                <div
                  key={d.dia}
                  tabIndex={0}
                  aria-label={`Dia ${d.dia}: ${plural(d.artes)}`}
                  className="group relative flex items-end justify-center px-px outline-none"
                >
                  <span
                    className="block w-full max-w-6 rounded-t bg-[var(--accent)] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
                    style={{ height: `${altura}%` }}
                  />
                  <span
                    className={`pointer-events-none absolute z-10 ${lado} opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 shadow-[var(--shadow-pop)]`}
                    style={{ bottom: `calc(${altura}% + 6px)` }}
                  >
                    <span className="block text-[13px] font-semibold">{plural(d.artes)}</span>
                    <span className="block text-[11px] text-[var(--muted)]">Dia {d.dia}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-2" aria-hidden="true">
        <div className="w-6 shrink-0" />
        <div
          className="flex-1 min-w-0 grid"
          style={{ gridTemplateColumns: `repeat(${dias.length}, minmax(0, 1fr))` }}
        >
          {dias.map((d) => (
            <span
              key={d.dia}
              className={`text-center text-[11px] tabular-nums ${
                d.dia === hoje ? "text-[var(--foreground)] font-semibold" : "text-[var(--muted)]"
              }`}
            >
              {d.dia === 1 || d.dia % 5 === 0 || d.dia === hoje ? d.dia : ""}
            </span>
          ))}
        </div>
      </div>

      {maior > 0 && (
        <details className="mt-1">
          <summary className="text-xs text-[var(--muted)] cursor-pointer hover:text-[var(--foreground)] w-fit">
            Ver em tabela
          </summary>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-x-4 gap-y-1 mt-2 text-xs">
            {dias
              .filter((d) => d.artes > 0)
              .map((d) => (
                <span key={d.dia} className="flex justify-between gap-2 tabular-nums">
                  <span className="text-[var(--muted)]">Dia {d.dia}</span>
                  <span className="font-medium">{d.artes}</span>
                </span>
              ))}
          </div>
        </details>
      )}
    </figure>
  );
}
