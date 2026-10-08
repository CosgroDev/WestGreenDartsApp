"use client";

import { useActionState, useState } from "react";

type ActionResult = { ok: boolean; message?: string };
export function ConfirmDeleteForm({ action, fields, description, label = "Delete" }: {
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>;
  fields: Record<string, string>; description: string; label?: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const [state, formAction, pending] = useActionState(action, { ok: false });
  return <div className="text-sm">
    {!confirm ? <button type="button" className="btn-secondary" onClick={() => setConfirm(true)}>{label}</button> :
      <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-red-200 p-3">
        {Object.entries(fields).map(([name, value]) => <input type="hidden" key={name} name={name} value={value} />)}
        <p>{description}</p>
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn-secondary text-red-700" disabled={pending}>{pending ? "Deleting…" : "Confirm delete"}</button>
          <button type="button" className="btn-secondary" disabled={pending} onClick={() => setConfirm(false)}>Cancel</button>
        </div>
        {state.message && <p role="alert" className="text-red-700">{state.message}</p>}
      </form>}
  </div>;
}
