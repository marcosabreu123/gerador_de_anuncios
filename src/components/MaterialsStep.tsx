"use client";

import MaterialsPanel from "@/components/MaterialsPanel";
import type { ImagemAnexo, TipoImagemAnexo } from "@/lib/types";

// Etapa contextual de "Materiais da arte" no fluxo de criação — aparece
// logo depois da 1ª resposta (quando o app já entendeu o que o lojista quer
// anunciar), não mais como um botão apagado solto no topo. Continua
// existindo um acesso discreto (o badge no header) pra quem quiser
// adicionar/trocar materiais depois dessa etapa.
export default function MaterialsStep({
  imagens,
  enviandoTipo,
  onSelecionarImagens,
  onRemover,
  onContinuar,
  enviando,
}: {
  imagens: ImagemAnexo[];
  enviandoTipo: TipoImagemAnexo | null;
  onSelecionarImagens: (tipo: TipoImagemAnexo, e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemover: (index: number) => void;
  onContinuar: () => void;
  enviando: boolean;
}) {
  const temAlgum = imagens.length > 0;

  return (
    <div className="card p-4 flex flex-col gap-4">
      <div>
        <h3 className="font-semibold text-sm">Quer adicionar algum material para deixar a arte mais fiel à sua loja?</h3>
        <p className="text-xs text-[var(--muted)] mt-1">
          Foto do produto, logo da marca ou referência de cores/estilo — todos opcionais.
        </p>
      </div>
      <MaterialsPanel
        imagens={imagens}
        enviandoTipo={enviandoTipo}
        onSelecionarImagens={onSelecionarImagens}
        onRemover={onRemover}
      />
      <button
        type="button"
        onClick={onContinuar}
        disabled={enviando || enviandoTipo !== null}
        className="btn btn-accent btn-block"
      >
        {temAlgum ? "Continuar" : "Continuar sem materiais"}
      </button>
    </div>
  );
}
