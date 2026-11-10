import { requireSocio } from "@/lib/auth";
import PainelDoMes from "@/components/PainelDoMes";
import { diaDoMesAgora, mesAtual, relatorioDoMes } from "@/lib/agencia/relatorio";

export default async function DashboardPage() {
  await requireSocio();
  const relatorio = await relatorioDoMes(mesAtual());
  const mes = new Date().toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  return <PainelDoMes {...relatorio} mes={mes} hoje={diaDoMesAgora()} />;
}
