import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { concluirJob, destravarJobsAbandonados, falharJob, reservarProximoJob } from "@/lib/agencia/fila";
import { gerarPeca } from "@/lib/agencia/gerar-peca";
import { devolverImagem } from "@/lib/agencia/pacotes";

export const runtime = "nodejs";
// Cada peça leva 40-90s (gpt-image-2 medido ao vivo neste projeto). 300s dá
// espaço para 2-3 peças por invocação sem risco de ser morto no meio.
export const maxDuration = 300;

// Orçamento de tempo próprio, abaixo do maxDuration: o worker para de pegar
// job novo quando o tempo restante não comporta mais uma peça. Sem isso a
// plataforma mataria o processo no meio de uma geração — e aí a peça ficaria
// travada em "gerando" com o crédito já gasto na OpenAI.
const ORCAMENTO_MS = 230_000;
const RESERVA_POR_PECA_MS = 95_000;

// Worker da fila. Acionado pelo cron da Vercel (ver vercel.json) e também
// manualmente logo após a aprovação de um pedido, para o lote começar na
// hora em vez de esperar o próximo minuto.
export async function POST(request: NextRequest) {
  const autorizado = await verificarAcesso(request);
  if (!autorizado) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const inicio = Date.now();
  const destravados = await destravarJobsAbandonados();
  const processados: { jobId: string; tipo: string; ok: boolean; erro?: string }[] = [];

  while (Date.now() - inicio < ORCAMENTO_MS - RESERVA_POR_PECA_MS) {
    const job = await reservarProximoJob();
    if (!job) break;

    try {
      if (job.tipo === "gerar_peca") {
        await gerarPeca(job.referencia_id);
      } else {
        throw new Error(`Tipo de job desconhecido: ${job.tipo}`);
      }
      await concluirJob(job.id);
      processados.push({ jobId: job.id, tipo: job.tipo, ok: true });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      console.error(`[fila] job ${job.id} falhou:`, e);
      await falharJob(job, erro);
      await marcarPecaComErro(job.referencia_id, job.tentativas >= job.max_tentativas, erro);
      processados.push({ jobId: job.id, tipo: job.tipo, ok: false, erro });
    }
  }

  return NextResponse.json({
    destravados,
    processados: processados.length,
    detalhes: processados,
    duracaoMs: Date.now() - inicio,
  });
}

// Deixa a peça em erro só quando as tentativas acabaram — enquanto houver
// retry pendente ela volta para "pendente", senão o operador veria um erro
// que o próprio sistema ainda vai resolver sozinho.
async function marcarPecaComErro(pecaId: string, definitivo: boolean, erro: string) {
  try {
    const supabase = createAdminClient();
    const { data: peca } = await supabase
      .from("pecas")
      .select("cliente_id, pacote_consumido")
      .eq("id", pecaId)
      .maybeSingle();

    await supabase
      .from("pecas")
      .update({ status: definitivo ? "erro" : "pendente", erro })
      .eq("id", pecaId);

    // Peça que falhou de vez não pode ficar cobrada do pacote do cliente.
    if (definitivo && peca?.pacote_consumido) {
      await devolverImagem(peca.cliente_id);
      await supabase.from("pecas").update({ pacote_consumido: false }).eq("id", pecaId);
    }
  } catch (e) {
    console.error("[fila] falha ao marcar peça com erro:", e);
  }
}

// Aceita duas origens: o cron da Vercel (Bearer CRON_SECRET) e um operador
// logado disparando o processamento pela interface.
async function verificarAcesso(request: NextRequest): Promise<boolean> {
  const segredo = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (segredo && header === `Bearer ${segredo}`) return true;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}

// O cron da Vercel chama via GET.
export async function GET(request: NextRequest) {
  return POST(request);
}
