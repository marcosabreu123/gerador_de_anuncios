import { ehSocio, requireOperador } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { contarAlertasCobranca } from "@/lib/agencia/pacotes";

// Moldura comum às telas logadas. Fica num layout para o menu não ser recriado a
// cada troca de tela: só o conteúdo muda, e o loading.tsx aparece na hora.
//
// Isto não é a proteção das telas: layout não roda de novo em navegação entre
// páginas, então cada page continua com o próprio requireOperador/requireSocio.
// Pelo mesmo motivo o número de Cobranças no menu só muda ao recarregar ou depois
// de uma ação do sócio, o que basta para algo que muda de um dia para o outro.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { perfil } = await requireOperador();
  const alertasCobranca = ehSocio(perfil) ? await contarAlertasCobranca() : 0;

  return (
    <AppShell nome={perfil.nome ?? perfil.email} papel={perfil.papel} alertasCobranca={alertasCobranca}>
      {children}
    </AppShell>
  );
}
