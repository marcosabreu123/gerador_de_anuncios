import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import AppHeader from "@/components/AppHeader";
import type { ImageRow } from "@/lib/types";

export default async function DashboardPage() {
  const { authId, perfil } = await requireUser();
  const supabase = await createClient();

  const { data: recentes } = await supabase
    .from("images")
    .select("id, project_id, imagem_gerada_url, created_at, status")
    .eq("user_id", authId)
    .not("imagem_gerada_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(6);

  const imagens = (recentes ?? []) as Pick<
    ImageRow,
    "id" | "project_id" | "imagem_gerada_url" | "created_at" | "status"
  >[];

  const semCredito = !perfil.is_admin && perfil.creditos_disponiveis <= 0;

  return (
    <>
      <AppHeader creditos={perfil.creditos_disponiveis} isAdmin={perfil.is_admin} />
      <main className="app-shell flex-1 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-bold">
            Olá{perfil.nome ? `, ${perfil.nome.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            {perfil.is_admin ? (
              <>Você tem créditos ilimitados (admin).</>
            ) : (
              <>
                Você tem{" "}
                <strong className="text-[var(--foreground)]">
                  {perfil.creditos_disponiveis} crédito{perfil.creditos_disponiveis === 1 ? "" : "s"}
                </strong>
                . Cada arte usa 1 crédito.
              </>
            )}
          </p>
        </div>

        {semCredito ? (
          <div className="card p-5 text-center border-dashed">
            <p className="font-semibold">Seus créditos acabaram</p>
            <p className="text-sm text-[var(--muted)] mt-1">
              Em breve você poderá comprar mais. Por enquanto, fale com o suporte.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Link href="/novo" className="btn btn-primary btn-block text-lg py-4">
              ✨ Criar arte nova
            </Link>
            <Link href="/melhorar" className="btn btn-outline btn-block">
              🎨 Melhorar uma arte pronta
            </Link>
            <Link href="/editar" className="btn btn-outline btn-block">
              ✏️ Editar um design que já tenho
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between mt-10 mb-3">
          <h2 className="font-semibold">Suas artes recentes</h2>
          {imagens.length > 0 && (
            <Link href="/historico" className="text-sm text-[var(--accent)] font-semibold">
              Ver tudo
            </Link>
          )}
        </div>

        {imagens.length === 0 ? (
          <p className="text-sm text-[var(--muted)] py-8 text-center">
            Você ainda não criou nenhuma arte. Comece agora! ✨
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {imagens.map((img) => (
              <Link
                key={img.id}
                href={`/resultado/${img.project_id}`}
                className="card overflow-hidden aspect-square block"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.imagem_gerada_url!}
                  alt="Arte gerada"
                  className="w-full h-full object-cover"
                />
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
