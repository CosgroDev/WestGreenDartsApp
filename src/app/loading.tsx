export default function Loading() {
  return <div className="space-y-3" role="status" aria-label="Loading page">
    <p className="text-sm text-slate-600">Loading…</p>
    {[0, 1, 2].map(i => <div key={i} className="card h-24" aria-hidden="true" />)}
  </div>;
}
