export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <p className="text-sm font-medium text-slate-500">{text}</p>
    </div>
  );
}
