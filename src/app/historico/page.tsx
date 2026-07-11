import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import type { ImageRow } from "@/lib/types";

export default async function HistoricoPage() {
  const { authId, perfil } = await requireUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("images")
    .select("id, project_id, imagem_gerada_url, status, created_at")
    .eq("user_id", authId)
    .not("imagem_gerada_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);

  const imagens = (data ?? []) as Pick<
    ImageRow,
    "id" | "project_id" | "imagem_gerada_url" | "status" | "created_at"
  >[];

  return (
    <>
      <AppHeader creditos={perfil.creditos_disponiveis} isAdmin={perfil.is_admin} />
      <main className="app-shell flex-1 py-6">
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold">Histórico</h1>
          <Link href="/novo" className="text-sm text-[var(--accent)] font-semibold">
            + Nova arte
          </Link>
        </div>

        {imagens.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-[var(--muted)]">Você ainda não gerou nenhuma arte.</p>
            <Link href="/novo" className="btn btn-primary mt-4 inline-flex">
              Criar primeira arte
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {imagens.map((img) => (
              <Link
                key={img.id}
                href={`/resultado/${img.project_id}`}
                className="card overflow-hidden aspect-square block relative"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.imagem_gerada_url!}
                  alt="Arte gerada"
                  className="w-full h-full object-cover"
                />
                {img.status === "ajustada" && (
                  <span className="absolute top-2 left-2 text-[10px] font-semibold bg-[var(--surface)]/90 px-2 py-0.5 rounded-full">
                    ajustada
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
