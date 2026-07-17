export function PageLoading({ label = "Loading..." }: { label?: string }) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-label={label}>
      <div className="h-7 w-28 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
      <div className="h-28 animate-pulse rounded-2xl bg-slate-200" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
