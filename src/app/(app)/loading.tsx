// Aparece assim que o operador troca de tela, enquanto o servidor busca os dados.
export default function Carregando() {
  return (
    <main className="pagina flex flex-col gap-6" aria-busy="true" aria-label="Carregando">
      <div className="esqueleto h-9 w-56" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="esqueleto h-28" />
        ))}
      </div>
      <div className="esqueleto h-80" />
    </main>
  );
}
