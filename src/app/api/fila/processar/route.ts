import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { concluirJob, destravarJobsAbandonados, falharJob, reservarProximoJob } from "@/lib/agencia/fila";
import { encerrarPedidoSePronto, gerarPeca } from "@/lib/agencia/gerar-peca";
import { devolverImagem } from "@/lib/agencia/pacotes";

export const runtime = "nodejs";
// 120s é o teto que este projeto aceita: medido em produção, 300 fazia a
// função falhar na partida (HTTP 500 imediato) enquanto 60 e 120 respondiam
// normalmente. É o mesmo valor já usado em /api/adjust.
export const maxDuration = 120;

// Orçamento de tempo próprio, abaixo do maxDuration: o worker para de pegar
// job novo quando o tempo restante não comporta mais uma peça. Sem isso a
// plataforma mataria o processo no meio de uma geração — e aí a peça ficaria
// travada em "gerando" com o crédito já gasto na OpenAI.
//
// Com 120s de teto e uma peça levando cerca de 60s, cabe UMA peça por invocação.
// O lote anda em paralelo porque o pedido e a tela disparam uma invocação por
// peça; o cron de minuto em minuto é a rede para o que sobrar.
const ORCAMENTO_MS = 100_000;
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
  const { religados, esgotados } = await destravarJobsAbandonados();
  for (const job of esgotados) {
    await marcarPecaComErro(job.referencia_id, true, "A geração foi interrompida em todas as tentativas.");
  }
  const processados: { jobId: string; tipo: string; ok: boolean; erro?: string }[] = [];

  // A primeira iteração sempre roda: com o orçamento apertado de 120s, a
  // checagem de tempo sozinha nunca liberaria nem uma peça, e a fila ficaria
  // parada para sempre.
  let primeiraRodada = true;
  while (primeiraRodada || Date.now() - inicio < ORCAMENTO_MS - RESERVA_POR_PECA_MS) {
    primeiraRodada = false;
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
    destravados: religados,
    esgotados: esgotados.length,
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
      .select("cliente_id, pedido_id, pacote_consumido, imagem_url")
      .eq("id", pecaId)
      .maybeSingle();
    if (!peca) return;

    // Peça que já tem imagem só pode ter falhado num ajuste, e a entrega de antes
    // continua valendo: não vira erro, não estorna o pacote e o botão "Tentar de
    // novo" não aparece para recriar do zero uma arte que estava boa.
    if (definitivo && peca.imagem_url) {
      await supabase
        .from("pecas")
        .update({ status: "gerada", erro: `O ajuste não saiu e a arte anterior foi mantida. ${erro}` })
        .eq("id", pecaId);
    } else {
      await supabase
        .from("pecas")
        .update({ status: definitivo ? "erro" : "pendente", erro })
        .eq("id", pecaId);

      // Peça que falhou de vez não pode ficar cobrada do pacote do cliente.
      if (definitivo && peca.pacote_consumido) {
        await devolverImagem(peca.cliente_id);
        await supabase.from("pecas").update({ pacote_consumido: false }).eq("id", pecaId);
      }
    }

    if (definitivo) await encerrarPedidoSePronto(peca.pedido_id);
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
  if (!user) return false;

  const { data: perfil } = await supabase
    .from("users")
    .select("papel, ativo")
    .eq("id", user.id)
    .maybeSingle();
  return Boolean(perfil?.ativo && (perfil.papel === "socio" || perfil.papel === "colaborador"));
}

// O cron da Vercel chama via GET.
export async function GET(request: NextRequest) {
  return POST(request);
}
