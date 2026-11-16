/** Esqueleto mostrado enquanto uma tela do app carrega: a navegação responde na hora, sem tela em branco. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando">
      <div className="h-9 w-56 animate-pulse rounded-full bg-hover" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-[var(--radius-xl)] border border-line-subtle bg-card" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-[var(--radius-xl)] border border-line-subtle bg-card" />
    </div>
  );
}
