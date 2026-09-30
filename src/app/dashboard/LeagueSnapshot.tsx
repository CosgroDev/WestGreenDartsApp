"use client";

import { useEffect, useState } from "react";
import { LEAGUE_SOURCE, TARGET_LEAGUE, type LeagueContext } from "@/lib/liveLeague";

export function LeagueSnapshot() {
  const [context, setContext] = useState<LeagueContext | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    let busy = false;
    let controller: AbortController | null = null;
    const load = async () => {
      if (busy) return;
      busy = true;
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 15000);
      if (active) setLoading(true);
      try {
        const response = await fetch("/api/league-snapshot", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("League unavailable");
        const data = await response.json() as LeagueContext;
        if (!Array.isArray(data.standings) || !data.standings.some(row => row.target)) throw new Error("Invalid standings");
        if (active) { setContext(data); setFailed(false); }
      } catch {
        if (active) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
        busy = false;
        if (active) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 300000);
    return () => { active = false; window.clearInterval(interval); controller?.abort(); };
  }, [refresh]);

  return (
    <section className="card" aria-labelledby="league-snapshot-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="league-snapshot-title" className="text-lg font-semibold">League snapshot</h2>
        <button type="button" className="btn-secondary text-sm" disabled={loading}
          onClick={() => setRefresh(value => value + 1)}>
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>
      <p className="mt-1 text-sm text-slate-600">{TARGET_LEAGUE}</p>
      {context && (
        <>
          <p className="mt-3 text-lg font-bold text-emerald-800">
            West Green · {context.targetPosition}{ordinal(context.targetPosition)} · {context.targetPoints} points
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">West Green and up to three teams above and below</caption>
              <thead className="border-b border-slate-300 text-slate-600">
                <tr><th scope="col" className="py-2 text-left">Pos</th><th scope="col" className="py-2 text-left">Team</th><th scope="col" className="py-2 text-right">Points</th></tr>
              </thead>
              <tbody>
                {context.standings.map(row => (
                  <tr key={row.teamId} className={row.target ? "bg-emerald-50 font-bold text-emerald-900" : "border-b border-slate-200 text-slate-800"}>
                    <td className="px-2 py-3">{row.position}</td>
                    <th scope="row" className="px-2 py-3 text-left font-inherit">{row.team}{row.target && <span className="sr-only"> (West Green)</span>}</th>
                    <td className="px-2 py-3 text-right tabular-nums">{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-600">Source checked {new Date(context.checkedAt).toLocaleString("en-GB")} · refreshes every 5 minutes</p>
        </>
      )}
      {failed && <p role="status" className="mt-3 text-sm text-amber-800">
        {context ? "Refresh failed. Showing the last retrieved table." : "The live league table is temporarily unavailable. Please try again."}
      </p>}
      {!context && !failed && <p role="status" className="mt-3 text-sm text-slate-600">Loading live standings…</p>}
      <a href={LEAGUE_SOURCE} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-emerald-800 underline">View full league table ↗</a>
    </section>
  );
}

function ordinal(position: number) {
  const remainder = position % 100;
  if (remainder >= 11 && remainder <= 13) return "th";
  return ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[position % 10] ?? "th";
}
