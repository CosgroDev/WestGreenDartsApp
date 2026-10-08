"use client";
import { useState } from "react";
import { createPracticeSessionAction } from "./actions";
import StartGameForm from "./StartGameForm";

export default function X01StartForm({ players }: { players: { id: string; name: string }[] }) {
  const [mode, setMode] = useState("two-player");
  const [playerA, setPlayerA] = useState("");
  const [playerB, setPlayerB] = useState("");
  return <StartGameForm action={createPracticeSessionAction} label="Start X01">
    <label className="flex min-w-0 flex-col gap-1 text-sm">Players<select name="playMode" className="input w-full min-w-0" value={mode} onChange={e => setMode(e.target.value)}><option value="two-player">Two players</option><option value="solo">Solo training</option></select></label>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
      <label className="flex min-w-0 flex-col gap-1 text-sm">{mode === "solo" ? "Player" : "Player A"}<select name="playerA" className="input w-full min-w-0" value={playerA} onChange={e => { setPlayerA(e.target.value); if (e.target.value === playerB) setPlayerB(""); }}><option value="">{mode === "solo" ? "Guest (unlinked stats)" : "Guest A (unlinked stats)"}</option>{players.filter(p => p.id !== playerB || mode === "solo").map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {mode !== "solo" && <label className="flex min-w-0 flex-col gap-1 text-sm">Player B<select name="playerB" className="input w-full min-w-0" value={playerB} onChange={e => setPlayerB(e.target.value)}><option value="">Guest B (unlinked stats)</option>{players.filter(p => p.id !== playerA).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
    </div>
    <p className="text-sm text-slate-600">Team players keep their practice records. Guests can play without adding a roster entry.</p>
    <label className="flex min-w-0 flex-col gap-1 text-sm">Start score<select name="startScore" className="input w-full min-w-0" defaultValue="501"><option>301</option><option>501</option><option>701</option></select></label>
    <fieldset className="min-w-0"><legend className="mb-2 text-sm font-semibold">Legs to play</legend><div className="grid grid-cols-4 gap-2">{[1,3,5,7].map(n => <label key={n} className="cursor-pointer"><input type="radio" name="legs" value={n} defaultChecked={n === 3} className="peer sr-only"/><span className="flex min-h-16 items-center justify-center rounded-lg border border-slate-300 p-2 text-center text-sm peer-checked:border-emerald-500 peer-checked:bg-emerald-600 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4">Play {n} {n === 1 ? "leg" : "legs"}</span></label>)}</div></fieldset>
    <p className="text-sm text-slate-600">Play every selected leg. Double out; the starting player alternates each leg.</p>
  </StartGameForm>;
}
