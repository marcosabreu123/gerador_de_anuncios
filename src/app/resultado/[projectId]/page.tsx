import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import ResultadoView, { type ArteItem } from "@/components/ResultadoView";
import { FORMATOS, type Formato } from "@/lib/types";

export default async function ResultadoPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { authId, perfil } = await requireUser();
  const supabase = await createClient();

  const { data: projeto } = await supabase
    .from("projects")
    .select("id, nome_projeto, formato, user_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!projeto || projeto.user_id !== authId) notFound();

  const { data: imagens } = await supabase
    .from("images")
    .select("id, imagem_gerada_url, status")
    .eq("project_id", projectId)
    .not("imagem_gerada_url", "is", null)
    .order("created_at", { ascending: false });

  const artes = (imagens ?? []) as ArteItem[];
  const ratioClass = FORMATOS[(projeto.formato as Formato) ?? "quadrado"]?.ratio ?? "aspect-square";

  return (
    <>
      <AppHeader creditos={perfil.creditos_disponiveis} />
      <main className="app-shell flex-1 py-6">
        <div className="flex items-center justify-between mb-4">
          <Link href="/dashboard" className="text-sm text-[var(--muted)]">
            ← Voltar
          </Link>
          <span className="text-sm font-semibold truncate max-w-[60%]">
            {projeto.nome_projeto ?? "Sua arte"}
          </span>
        </div>

        {artes.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-10 text-center">
            Nenhuma variação disponível para este projeto.
          </p>
        ) : (
          <ResultadoView
            projectId={projectId}
            nomeProjeto={projeto.nome_projeto ?? "arte"}
            ratioClass={ratioClass}
            inicial={artes}
          />
        )}
      </main>
    </>
  );
}
