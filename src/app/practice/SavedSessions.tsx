"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SavedPractice } from "@/data/practiceHistory";

export function KillerSavedGame({ kind = "active", playerName }: { kind?: "active" | "results"; playerName?: string }) {
  const [saved, setSaved] = useState<{ names: string; complete: boolean } | null>(null);
  useEffect(() => {
    try {
      const value = JSON.parse(localStorage.getItem("wgd_killer_game") ?? "null");
      const game = value?.game ?? value;
      if (game?.id && Array.isArray(game.players) && game.players.length) {
        setSaved({ names: game.players.map((p: { name: string }) => p.name).join(", "), complete: game.state === "game_over" || game.state === "rollover" });
      }
    } catch { /* An unavailable local store must not prevent cross-device practice. */ }
  }, []);
  if (!saved || (kind === "active" && saved.complete) || (kind === "results" && !saved.complete) || (playerName && !saved.names.split(", ").includes(playerName))) return null;
  return <Link href="/pub-games/killer" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
    <span className="min-w-0 flex-1"><strong>Killer</strong><span className="block break-words text-sm text-slate-600">{saved.names}</span><span className="block text-xs text-slate-500">Saved on this device only</span></span>
    <span className="btn btn-secondary">{saved.complete ? "Results" : "Resume"} →</span>
  </Link>;
}

export default function SavedSessions({ sessions, errors = [], players, kind = "both", modeFilter = true, retryHref = "/practice" }: {
  sessions: SavedPractice[]; errors?: string[]; players: { id: string; name: string }[]; kind?: "both" | "active" | "results"; modeFilter?: boolean; retryHref?: string;
}) {
  const [mode, setMode] = useState("");
  const [player, setPlayer] = useState("");
  const filtered = sessions.filter(s => (!mode || s.mode === mode) && (!player || s.playerIds.includes(player)));
  const active = filtered.filter(s => s.status === "in_progress");
  const results = filtered.filter(s => s.status !== "in_progress");
  const rows = (items: SavedPractice[], empty: string) => items.length ? <ul className="divide-y divide-slate-200">
    {items.map(s => <li key={`${s.mode}:${s.id}`}><Link href={s.href} className="flex flex-wrap items-center justify-between gap-3 py-3">
      <span className="min-w-0 flex-1"><strong className="block">{s.title}</strong><span className="block break-words text-sm">{s.players}</span>
        <span className="block text-sm text-slate-600">{s.detail}{s.status === "abandoned" || s.status === "cancelled" ? " · Ended early" : s.status === "won" ? " · Challenge completed" : ""}</span>
        <span className="block text-xs text-slate-500">Updated {new Date(s.updatedAt).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
      </span><span className="btn btn-secondary">{s.status === "in_progress" ? "Resume" : "Results"} →</span>
    </Link></li>)}
  </ul> : <p className="py-3 text-sm text-slate-600">{empty}</p>;
  return <section className="card flex flex-col gap-3">
    <h2 className="text-lg font-semibold">{kind === "results" ? "Recent results" : "Continue playing"}</h2>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {modeFilter && <label className="flex min-w-0 flex-col gap-1 text-sm">Mode<select className="input w-full min-w-0" value={mode} onChange={e => setMode(e.target.value)}><option value="">All modes</option><option value="x01">X01</option><option value="121">121 Challenge</option><option value="doubles">Doubles Switch</option><option value="checkout">Random Checkout</option><option value="killer">Killer (this device)</option></select></label>}
      <label className="flex min-w-0 flex-col gap-1 text-sm">Player<select className="input w-full min-w-0" value={player} onChange={e => setPlayer(e.target.value)}><option value="">All players</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    </div>
    {errors.length > 0 && <div role="alert" className="rounded-lg border border-red-300 p-3"><p>Some saved games could not be loaded: {errors.join(", ")}. They have not been deleted.</p><Link href={retryHref} className="underline">Retry loading practice</Link></div>}
    {kind !== "results" && <>{mode !== "killer" && rows(active, errors.length ? "The available modes have no matching active games." : "No matching active games. Choose a mode below to start.")}{modeFilter && (!mode || mode === "killer") && <KillerSavedGame playerName={players.find(p => p.id === player)?.name} />} {mode === "killer" && <p className="text-sm text-slate-600">Killer is saved in this browser. <Link href="/pub-games/killer" className="underline">Open Killer</Link> to resume or start a new game.</p>}</>}
    {kind !== "active" && <>{kind === "both" && <h2 className="pt-2 text-lg font-semibold">Recent results</h2>}{mode !== "killer" && rows(results.slice(0, 20), "No matching recent results.")}{modeFilter && (!mode || mode === "killer") && <KillerSavedGame kind="results" playerName={players.find(p => p.id === player)?.name} />}</>}
  </section>;
}
