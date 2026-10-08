"use client";

// A boundary reset alone reuses a failed server payload. Reload requests fresh data.
export default function ErrorPage() {
  return <div className="card space-y-3" role="alert">
    <h2 className="font-semibold">The request could not be completed</h2>
    <p>Try loading this screen again. Your latest action may already have saved, so check the most recent visit before entering it again.</p>
    <button type="button" className="btn-primary" onClick={() => window.location.reload()}>Try again</button>
  </div>;
}
