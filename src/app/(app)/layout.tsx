import { requireOperador } from "@/lib/auth";
import AppShell from "@/components/AppShell";

// Moldura comum às telas logadas. Fica num layout para o menu não ser recriado a
// cada troca de tela: só o conteúdo muda, e o loading.tsx aparece na hora.
//
// Isto não é a proteção das telas: layout não roda de novo em navegação entre
// páginas, então cada page continua com o próprio requireOperador/requireSocio.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { perfil } = await requireOperador();

  return (
    <AppShell nome={perfil.nome ?? perfil.email} papel={perfil.papel}>
      {children}
    </AppShell>
  );
}
