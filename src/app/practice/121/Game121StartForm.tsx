"use client";
import StartGameForm from "../StartGameForm";
import { start121GameAction } from "./actions";

export default function Game121StartForm({ players }: { players: { id: string; name: string }[] }) {
  return <StartGameForm action={start121GameAction} label="Start 121">
    <label className="flex min-w-0 flex-col gap-1 text-sm">Player<select name="playerId" required className="input w-full min-w-0"><option value="">Choose a player</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-3"><input type="checkbox" name="advanceBaseOnAnyFinish" className="mt-1"/><span><strong className="text-sm">Advance base on any finish</strong><span className="block text-sm text-slate-600">Lock each completed target, even when you finish in visit 2 or 3.</span></span></label>
  </StartGameForm>;
}
