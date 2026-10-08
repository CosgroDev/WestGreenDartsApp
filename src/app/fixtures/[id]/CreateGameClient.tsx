"use client";

import { useRef } from "react";
import { ActionForm, PendingButton } from "@/components/ActionForm";
import { createGameAction } from "./actions";

export function CreateGameForm({ fixtureId, disable, players, season }: { fixtureId: string; disable: boolean; players: { id: string; name: string }[]; season?: string }) {
  const requestRef = useRef<HTMLInputElement>(null);
  return <ActionForm action={async form => {
    const requestInput = requestRef.current;
    if (!requestInput) return { ok: false, message: "Unable to start. Refresh and try again" };
    if (!requestInput.value) requestInput.value = crypto.randomUUID();
    form.set("gameRequest", requestInput.value);
    return createGameAction({ ok: false }, form);
  }} className="flex flex-col gap-3">
    <input ref={requestRef} type="hidden" name="gameRequest" defaultValue="" />
    <input type="hidden" name="fixtureId" value={fixtureId} />
    <input type="hidden" name="season" value={season ?? ""} />
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="match-player">West Green player</label>
        <select id="match-player" name="playerId" defaultValue="" disabled={disable} required className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2">
          <option value="">Select player</option>
          {players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor="match-opponent">Opponent player</label>
        <input id="match-opponent" name="opponent" required disabled={disable} className="w-full min-w-0 rounded-md border border-slate-300 px-3 py-2" placeholder="Opponent name" />
      </div>
    </div>
    <PendingButton disabled={disable} className="btn-primary self-start" pendingLabel="Starting match…">Start match and score</PendingButton>
  </ActionForm>;
}
