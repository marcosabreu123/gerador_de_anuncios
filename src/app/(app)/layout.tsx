import { ehSocio, requireOperador } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { contarAlertasCobranca } from "@/lib/agencia/pacotes";
import { lerSaldoOpenAI } from "@/lib/agencia/saldo-openai";

// Moldura comum às telas logadas. Fica num layout para o menu não ser recriado a
// cada troca de tela: só o conteúdo muda, e o loading.tsx aparece na hora.
//
// Isto não é a proteção das telas: layout não roda de novo em navegação entre
// páginas, então cada page continua com o próprio requireOperador/requireSocio.
// Pelo mesmo motivo os avisos do menu (clientes que pedem ação, saldo da OpenAI)
// só mudam ao recarregar ou depois de uma ação do sócio, o que basta para algo
// que muda de um dia para o outro.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { perfil } = await requireOperador();
  const socio = ehSocio(perfil);
  const [alertasCobranca, saldoOpenAI] = socio
    ? await Promise.all([contarAlertasCobranca(), lerSaldoOpenAI()])
    : ([0, null] as const);

  return (
    <AppShell
      nome={perfil.nome ?? perfil.email}
      papel={perfil.papel}
      alertasCobranca={alertasCobranca}
      saldoOpenAI={saldoOpenAI}
    >
      {children}
    </AppShell>
  );
}
