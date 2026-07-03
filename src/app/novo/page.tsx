import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import ChatWizard from "@/components/ChatWizard";

export default async function NovoPage() {
  const { perfil } = await requireUser();

  // Sem créditos → não deixa entrar no fluxo.
  if (perfil.creditos_disponiveis <= 0) redirect("/dashboard");

  return (
    <>
      <AppHeader creditos={perfil.creditos_disponiveis} />
      <main className="app-shell flex flex-col py-4 h-[calc(100dvh-3.5rem)]">
        <ChatWizard />
      </main>
    </>
  );
}
