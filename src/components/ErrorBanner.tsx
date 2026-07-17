import { errorBoxClass } from "@/lib/ui";

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className={`${errorBoxClass} flex items-start justify-between gap-3`}>
      <p className="min-w-0 flex-1">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-50"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
