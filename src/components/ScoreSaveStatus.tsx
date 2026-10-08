"use client";
export function ScoreSaveStatus({ pending, saved, error, retry, reload, savedMessage = "Saved ✓" }: {
  pending: boolean; saved: boolean; error: string | null; retry: () => void; reload: () => void;
  savedMessage?: string;
}) {
  return <div className="text-sm" aria-live="polite">
    {pending ? <p role="status" className="text-slate-600">Saving…</p> : error ? <div className="rounded-lg bg-red-50 p-3 text-red-800" role="alert">
      <p>{error}</p><p className="mt-1 text-xs">Your entry has been kept. Retry uses the same score request.</p>
      <div className="mt-2 flex flex-wrap gap-2"><button className="btn-secondary" onClick={retry}>Retry save</button>
      <button className="btn-secondary" onClick={reload}>Reload latest score</button></div>
    </div> : saved ? <p role="status" className="text-emerald-800">{savedMessage}</p> : null}
  </div>;
}
