import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import NovoWizard from "@/components/NovoWizard";

export default async function NovoPage() {
  const { perfil } = await requireUser();

  // Sem créditos → não deixa entrar no fluxo.
  if (perfil.creditos_disponiveis <= 0) redirect("/dashboard");

  return (
    <>
      <AppHeader creditos={perfil.creditos_disponiveis} />
      <main className="app-shell flex-1 flex flex-col py-6">
        <NovoWizard />
      </main>
    </>
  );
}
