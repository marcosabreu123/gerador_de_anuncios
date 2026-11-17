import { requireSocio } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import CadastroComIA from "@/components/CadastroComIA";
import { hojeSP } from "@/lib/datas";
import { precosSugeridos } from "@/lib/agencia/cobrancas";
import type { Pacote } from "@/lib/agencia/types";

// Cadastro de cliente conversando com a IA. Só sócio, como o cadastro à mão: o
// cliente entra com o primeiro plano ou em teste.
//
// A página ocupa a altura da janela, para a conversa rolar por dentro e a caixa de
// mensagem e o botão de cadastrar ficarem à vista no notebook do dono (1536×695).
export default async function CadastroComIAPage() {
  await requireSocio();
  const supabase = await createClient();
  const { data: pacotes } = await supabase
    .from("pacotes")
    .select("tipo, meses, valor_centavos, status")
    .order("created_at", { ascending: false });

  return (
    <main className="pagina flex flex-col gap-4 h-[calc(100dvh-3.5rem)] min-h-[620px] lg:h-dvh lg:min-h-[560px] lg:pb-6">
      <CadastroComIA hoje={hojeSP()} precos={precosSugeridos((pacotes ?? []) as Pacote[])} />
    </main>
  );
}
