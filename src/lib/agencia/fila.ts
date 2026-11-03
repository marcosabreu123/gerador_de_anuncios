import { createAdminClient } from "@/lib/supabase/admin";
import type { FilaJob, TipoJob } from "./types";

// Fila de jobs em tabela, processada por um worker acionado por cron.
//
// Por que existe: um lote de 5 imagens leva de 3 a 8 minutos (cada geração
// com gpt-image-2 custa 40-90s, medido ao vivo neste projeto). Isso não cabe
// numa request da Vercel, nem com maxDuration no teto. Com a fila, o operador
// aprova o lote e pode fechar o notebook — o trabalho continua.
//
// Usa o client admin de propósito: o worker roda a partir do cron, sem sessão
// de usuário, então não há auth.uid() para as policies de RLS avaliarem.

const LIMITE_PADRAO = 3;

export async function enfileirar(
  tipo: TipoJob,
  referenciaId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("fila_jobs").insert({
    tipo,
    referencia_id: referenciaId,
    payload: payload ?? null,
  });
  if (error) {
    console.error("[fila] falha ao enfileirar:", error);
    throw new Error("Não foi possível enfileirar o trabalho.");
  }
}

// Reserva um job para processamento. O `.eq("status", "pendente")` dentro do
// próprio UPDATE é o que impede dois workers de pegarem o mesmo job quando
// duas execuções do cron se sobrepõem — mesma ideia do débito atômico de
// crédito do modelo antigo.
export async function reservarProximoJob(): Promise<FilaJob | null> {
  const supabase = createAdminClient();

  const { data: candidatos } = await supabase
    .from("fila_jobs")
    .select("*")
    .eq("status", "pendente")
    .lte("agendado_para", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(LIMITE_PADRAO);

  for (const candidato of candidatos ?? []) {
    const { data: reservado } = await supabase
      .from("fila_jobs")
      .update({
        status: "processando",
        iniciado_em: new Date().toISOString(),
        tentativas: candidato.tentativas + 1,
      })
      .eq("id", candidato.id)
      .eq("status", "pendente")
      .select("*")
      .maybeSingle();

    if (reservado) return reservado as FilaJob;
  }

  return null;
}

export async function concluirJob(id: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("fila_jobs")
    .update({ status: "concluido", concluido_em: new Date().toISOString() })
    .eq("id", id);
}

// Falha com retry. Volta para "pendente" enquanto houver tentativa sobrando,
// com espera crescente — uma instabilidade momentânea da OpenAI não deve
// queimar a peça de um cliente pagante.
export async function falharJob(job: FilaJob, erro: string): Promise<void> {
  const supabase = createAdminClient();
  const esgotou = job.tentativas >= job.max_tentativas;

  if (esgotou) {
    await supabase
      .from("fila_jobs")
      .update({ status: "erro", erro, concluido_em: new Date().toISOString() })
      .eq("id", job.id);
    return;
  }

  const esperaMs = job.tentativas * 60_000;
  await supabase
    .from("fila_jobs")
    .update({
      status: "pendente",
      erro,
      agendado_para: new Date(Date.now() + esperaMs).toISOString(),
    })
    .eq("id", job.id);
}

// Jobs travados em "processando" (ex.: a function morreu no meio). Sem isso
// eles ficariam parados para sempre, e o lote nunca concluiria.
export async function destravarJobsAbandonados(minutos = 15): Promise<number> {
  const supabase = createAdminClient();
  const limite = new Date(Date.now() - minutos * 60_000).toISOString();

  const { data } = await supabase
    .from("fila_jobs")
    .update({ status: "pendente", erro: "Reiniciado após processamento interrompido" })
    .eq("status", "processando")
    .lt("iniciado_em", limite)
    .select("id");

  return data?.length ?? 0;
}
