"use client";

import { useRef } from "react";
import { TIPOS_IMAGEM_ANEXO, type ImagemAnexo, type TipoImagemAnexo } from "@/lib/types";

const TIPOS_ANEXO: TipoImagemAnexo[] = ["produto", "referencia", "logotipo"];

// Os 3 slots de upload de "Materiais da arte" (foto do produto, logo,
// referência de cores/estilo) — usado tanto na etapa contextual do fluxo de
// criação (ver MaterialsStep.tsx) quanto no painel lateral sempre
// disponível (ver ChatWizard.tsx). Cada instância monta seus próprios
// inputs/refs de arquivo, então pode existir mais de uma na árvore sem
// conflito.
export default function MaterialsPanel({
  imagens,
  enviandoTipo,
  onSelecionarImagens,
  onRemover,
}: {
  imagens: ImagemAnexo[];
  enviandoTipo: TipoImagemAnexo | null;
  onSelecionarImagens: (tipo: TipoImagemAnexo, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemover: (index: number) => void;
}) {
  const fileRefs = useRef<Record<TipoImagemAnexo, HTMLInputElement | null>>({
    produto: null,
    referencia: null,
    logotipo: null,
  });

  return (
    <div className="flex flex-col gap-3">
      {TIPOS_ANEXO.map((tipo) => {
        const info = TIPOS_IMAGEM_ANEXO[tipo];
        const anexosDoTipo = imagens
          .map((img, index) => ({ img, index }))
          .filter(({ img }) => img.tipo === tipo);
        return (
          <div key={tipo} className="card p-3">
            <p className="font-semibold text-sm capitalize">{info.label}</p>
            <p className="text-xs text-[var(--muted)] mt-0.5 mb-2">{info.ajuda}</p>

            {anexosDoTipo.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {anexosDoTipo.map(({ img, index }) => (
                  <div key={index} className="w-14 h-14 rounded-lg overflow-hidden border border-[var(--border)] relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.url} alt={tipo} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => onRemover(index)}
                      className="absolute top-0 right-0 bg-black/60 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-bl"
                      aria-label="Remover"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => fileRefs.current[tipo]?.click()}
              disabled={enviandoTipo !== null}
              className="btn btn-outline btn-block text-sm py-2 disabled:opacity-50"
            >
              {enviandoTipo === tipo ? "Enviando…" : anexosDoTipo.length > 0 ? "+ Adicionar outra" : info.botao}
            </button>
            <input
              ref={(el) => {
                fileRefs.current[tipo] = el;
              }}
              type="file"
              accept="image/*"
              multiple={tipo !== "logotipo"}
              onChange={(e) => onSelecionarImagens(tipo, e)}
              className="hidden"
            />
          </div>
        );
      })}
    </div>
  );
}
