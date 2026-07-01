// Baixa uma imagem por URL forçando o download (em vez de abrir na aba).
export async function baixarArte(url: string, nomeArquivo: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objUrl);
  } catch {
    // Fallback: abre em nova aba se o download direto falhar.
    window.open(url, "_blank");
  }
}
