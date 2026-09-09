"use client";

export default function ErrorPage(_: { error: Error; reset: () => void }) {
  return <div className="card space-y-3" role="alert">
    <h2 className="font-semibold">The request could not be completed</h2>
    <p>Reload the latest score before trying again.</p>
    <button className="rounded border px-4 py-2" onClick={() => window.location.reload()}>Reload</button>
  </div>;
}
