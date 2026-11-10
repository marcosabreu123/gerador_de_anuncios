import type { SupabaseClient } from "@supabase/supabase-js";
import type { EstiloComunicacao, Formato, IntensidadeVisual, TipoImagem } from "@/lib/types";
import { pedidoDosCampos, type ObjetivoArte } from "./objetivos";
import { operadorEscreveu, type BriefingPecaManual, type ModoImagemEnviada, type Pedido } from "./types";

// Um pedido antigo aberto de novo pelo botão "Repetir pedido": texto e controles
// voltam como estavam, e o operador muda só o que quiser.
export interface PedidoParaRepetir {
  titulo: string;
  prompt: string;
  quantidade: number;
  formato: Formato;
  estilo: EstiloComunicacao;
  intensidade: IntensidadeVisual;
  tipoImagem: TipoImagem;
  produtoRefId: string | null;
  arteBaseUrl: string | null;
  modoTransformacao: ModoImagemEnviada;
  objetivo: ObjetivoArte;
  // Os campos do objetivo como a tela guarda: { produto: "...", preco: "..." }.
  campos: Record<string, string>;
}

// O pedido antigo como estava: o texto do operador e os controles da primeira peça.
// Pedido de outro cliente não serve, mesmo que o id venha no link.
export async function pedidoParaRepetir(
  supabase: SupabaseClient,
  pedidoId: string,
  clienteId: string,
): Promise<PedidoParaRepetir | null> {
  const [{ data: pedidoRaw }, { data: pecas }] = await Promise.all([
    supabase.from("pedidos").select("*").eq("id", pedidoId).eq("cliente_id", clienteId).maybeSingle(),
    supabase.from("pecas").select("briefing").eq("pedido_id", pedidoId).order("ordem"),
  ]);
  const pedido = pedidoRaw as Pedido | null;
  const primeira = (pecas?.[0]?.briefing ?? null) as BriefingPecaManual | null;
  if (!pedido || !primeira) return null;

  const texto = pedido.pedido_original ?? primeira.prompt ?? "";
  const objetivo = primeira.objetivo ?? "livre";
  const obrigatorios = primeira.obrigatorios ?? [];
  // Pedido feito só pelos campos: o texto foi montado com eles e voltaria repetido.
  const soCampos = obrigatorios.length > 0 && texto === pedidoDosCampos(objetivo, obrigatorios);
  return {
    titulo: pedido.titulo ?? "sem título",
    // "Melhorar esta arte" sem texto guarda uma frase pronta no lugar do pedido.
    prompt: operadorEscreveu(texto) && !soCampos ? texto : "",
    // As adaptações de "Outro formato" não foram pedidas na tela: não contam.
    quantidade: Math.min(
      Math.max((pecas ?? []).filter((p) => !(p.briefing as BriefingPecaManual | null)?.adaptadaDe).length, 1),
      4,
    ),
    // Um ajuste pode ter trocado o formato depois: vale o da primeira versão.
    formato: primeira.versoes?.[0]?.formato ?? primeira.formato ?? "feed-4-5",
    estilo: primeira.estilo ?? "ia_decide",
    intensidade: primeira.intensidade ?? "ia_decide",
    tipoImagem: primeira.tipoImagem ?? "ia_decide",
    produtoRefId: primeira.produtoRefId ?? null,
    arteBaseUrl: primeira.arteBaseUrl ?? null,
    modoTransformacao: primeira.modoTransformacao ?? "referencia",
    objetivo,
    campos: Object.fromEntries(obrigatorios.map((t) => [t.campo, t.valor])),
  };
}
