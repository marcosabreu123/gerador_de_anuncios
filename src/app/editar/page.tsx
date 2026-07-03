import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import EditarWizard from "@/components/EditarWizard";

export default async function EditarPage() {
  const { perfil } = await requireUser();

  // Sem créditos → não deixa entrar no fluxo.
  if (perfil.creditos_disponiveis <= 0) redirect("/dashboard");

  return (
    <>
      <AppHeader creditos={perfil.creditos_disponiveis} />
      <main className="app-shell flex-1 flex flex-col py-6">
        <EditarWizard />
      </main>
    </>
  );
}
