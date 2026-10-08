"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

const ActionPending = createContext(false);
export type FormActionResult = { ok: boolean; message?: string };

/** Preserves entered values on failure and gives server actions visible feedback. */
export function ActionForm({ action, children, className, successMessage = "Saved." }: {
  action: (formData: FormData) => Promise<void | FormActionResult>;
  children: React.ReactNode;
  className?: string;
  successMessage?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  return <form className={className} onSubmit={event => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action(data);
        setMessage({ text: result?.message || (result?.ok === false ? "Could not save. Your entries are kept; please try again." : successMessage), error: result?.ok === false });
      } catch (error) {
        // Next handles redirect responses; don't display them as failed saves.
        if (error instanceof Error && error.message === "NEXT_REDIRECT") return;
        setMessage({ text: error instanceof Error ? error.message : "Could not save. Your entries are kept; please try again.", error: true });
      }
    });
  }}>
    <ActionPending.Provider value={pending}>
      <fieldset disabled={pending} className="contents">{children}</fieldset>
    </ActionPending.Provider>
    {message && <p role={message.error ? "alert" : "status"} className={`mt-2 text-sm ${message.error ? "text-red-700" : "text-emerald-700"}`}>{message.text}</p>}
  </form>;
}

export function PendingButton({ children, pendingLabel = "Saving…", className = "btn-primary", ...props }:
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type"> & { pendingLabel?: string }) {
  const { pending: formPending } = useFormStatus();
  const actionPending = useContext(ActionPending);
  const pending = formPending || actionPending;
  return <button {...props} type="submit" className={className} disabled={pending || props.disabled} aria-busy={pending}>
    {pending ? pendingLabel : children}
  </button>;
}

export function ConfirmSubmitButton({ children, message, confirmLabel = "Confirm", className = "btn-secondary", pendingLabel = "Saving…" }: {
  children: React.ReactNode; message: string; confirmLabel?: string; className?: string; pendingLabel?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const { pending: formPending } = useFormStatus();
  const actionPending = useContext(ActionPending);
  const pending = formPending || actionPending;
  const descriptionId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (confirming) cancel.current?.focus(); }, [confirming]);
  function close() {
    if (pending) return;
    setConfirming(false);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return confirming ? <div role="group" aria-label={confirmLabel} aria-describedby={descriptionId} aria-busy={pending}
    className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-300 p-3"
    onKeyDown={event => { if (event.key === "Escape" && !pending) { event.preventDefault(); close(); } }}>
    <p id={descriptionId} className="text-sm text-slate-700">{message}</p>
    <div className="flex flex-wrap gap-2">
      <PendingButton className={className} pendingLabel={pendingLabel} aria-describedby={descriptionId}>{confirmLabel}</PendingButton>
      <button ref={cancel} type="button" className="btn-secondary" disabled={pending} aria-describedby={descriptionId} onClick={close}>Cancel</button>
    </div>
  </div> : <button ref={trigger} type="button" className={className} disabled={pending} onClick={() => setConfirming(true)}>{children}</button>;
}
