import Link from "next/link";
import { getPlayers } from "@/data/players";
import { get121PlayerStats } from "@/data/game121";
import { getSavedPractice } from "@/data/practiceHistory";
import SavedSessions from "../SavedSessions";
import Game121StartForm from "./Game121StartForm";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Game121Page() {
  const [roster, records, saved] = await Promise.allSettled([getPlayers(), get121PlayerStats(), getSavedPractice("121")]);
  const players = roster.status === "fulfilled" ? roster.value : [];
  const stats = records.status === "fulfilled" ? records.value : [];
  const sessions = saved.status === "fulfilled" ? saved.value : [];
  return <main className="flex flex-col gap-4">
    <header><Link href="/practice" className="btn btn-secondary mb-3">← Practice</Link><h1 className="text-2xl font-bold">121 Challenge</h1><p className="mt-1 text-sm text-slate-600">Solo training · Work from 121 to 170, with three visits per target.</p></header>
    <SavedSessions sessions={sessions} players={players} errors={saved.status === "rejected" ? ["121 Challenge"] : []} modeFilter={false} retryHref="/practice/121" kind="active" />
    <section className="card"><h2 className="mb-3 text-lg font-semibold">Start a game</h2>{roster.status === "rejected" ? <p role="alert">The roster could not be loaded. <Link href="/practice/121" className="underline">Retry</Link></p> : <Game121StartForm players={players.filter(p => p.active)} />}</section>
    <details className="card"><summary className="cursor-pointer font-semibold">How to play</summary><div className="mt-3 flex flex-col gap-3 text-sm text-slate-600">
      <p>Start on 121 and work up to 170. Each target allows three visits of up to three darts.</p><p>Finish in visit 1 to lock the completed checkout as your base. Finish in visit 2 or 3 to advance the target while your base stays unchanged.</p><p>If you do not finish within three visits, return to your locked base. Bogey targets such as 159 need a setup before a later visit can finish.</p><p>With “Advance base on any finish”, any successful visit locks the completed checkout as your base.</p><p>Enter each visit total after throwing, and confirm a double or Bull when you finish. A miss scores zero. A bust keeps the starting remaining score and uses the visit.</p><p>Each visit is saved. Pause &amp; save leaves the game available to resume.</p>
    </div></details>
    <SavedSessions sessions={sessions} players={players} modeFilter={false} retryHref="/practice/121" kind="results" />
    <details className="card"><summary className="cursor-pointer font-semibold">Player records</summary>{records.status === "rejected" ? <p role="alert" className="mt-3">Records could not be loaded. <Link href="/practice/121" className="underline">Retry</Link></p> : stats.length ? <ul className="mt-3 divide-y divide-slate-200">{stats.map(p => <li key={p.player_id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="min-w-0 break-words"><strong>{p.name}</strong><span className="block text-slate-600">Best finished target {p.best_checkout ?? "–"} · First-visit finishes {p.lock_rate === null ? "–" : `${p.lock_rate}%`}</span></span><span>{p.games_won} won · {p.games_played} played</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No completed games yet.</p>}</details>
  </main>;
}
