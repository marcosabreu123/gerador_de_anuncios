// Lê a resposta de um fetch como JSON sem nunca deixar um erro técnico de
// parse vazar pra tela do usuário. Bug real observado: sob timeout/falha
// transiente, a hospedagem às vezes devolve uma página de erro em texto (ex:
// "An error occurred...") em vez do JSON esperado — chamar res.json() direto
// nesse caso lança "Unexpected token 'A', ... is not valid JSON", e esse
// texto cru acabava sendo mostrado pro lojista. Aqui, qualquer corpo que não
// seja JSON válido vira uma mensagem amigável genérica.
export async function lerRespostaJSON<T = Record<string, unknown>>(res: Response): Promise<T> {
  const texto = await res.text();
  try {
    return JSON.parse(texto) as T;
  } catch {
    throw new Error("Não consegui processar agora, tenta de novo?");
  }
}
