"use client";
import { useState, useTransition, type ReactNode } from "react";

export default function StartGameForm({ action, children, label }: {
  action: (data: FormData) => Promise<{ ok: boolean; message?: string } | void>;
  children: ReactNode; label: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <form onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        const result = await action(data);
        if (result && !result.ok) setError(result.message ?? "Could not start. Your choices are unchanged; please try again.");
      } catch (failure) {
        // Next handles successful redirects. Surface transport failures without losing inputs.
        if (failure instanceof Error && failure.message.includes("NEXT_REDIRECT")) throw failure;
        setError("Could not connect to start the game. Check your connection and try again.");
      }
    });
  }} className="flex flex-col gap-3">
    <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">{children}</fieldset>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button type="submit" disabled={pending} className="btn btn-primary w-full" aria-busy={pending}>{pending ? "Starting…" : label}</button>
  </form>;
}
