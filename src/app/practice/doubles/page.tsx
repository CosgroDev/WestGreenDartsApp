import Link from "next/link";
import { getPlayers } from "@/data/players";
import { getDoublesPlayerStats } from "@/data/doublesPractice";
import { getSavedPractice } from "@/data/practiceHistory";
import { DOUBLES_SEQUENCE } from "@/lib/doublesPractice";
import SavedSessions from "../SavedSessions";
import DoublesStartForm from "./DoublesStartForm";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoublesPage() {
  const [roster, records, saved] = await Promise.allSettled([getPlayers(), getDoublesPlayerStats(), getSavedPractice("doubles")]);
  const players = roster.status === "fulfilled" ? roster.value : [];
  const stats = records.status === "fulfilled" ? records.value : [];
  const sessions = saved.status === "fulfilled" ? saved.value : [];
  return <main className="flex flex-col gap-4">
    <header><Link href="/practice" className="btn btn-secondary mb-3">← Practice</Link><h1 className="text-2xl font-bold">Doubles Switch</h1><p className="mt-1 text-sm text-slate-600">Solo or group · Rotate through doubles, then random targets.</p></header>
    <SavedSessions sessions={sessions} players={players} errors={saved.status === "rejected" ? ["Doubles Switch"] : []} modeFilter={false} retryHref="/practice/doubles" kind="active" />
    <section className="card"><h2 className="mb-3 text-lg font-semibold">Start a game</h2>{roster.status === "rejected" ? <p role="alert">The roster could not be loaded. <Link href="/practice/doubles" className="underline">Retry</Link></p> : <DoublesStartForm players={players.filter(p => p.active)} />}</section>
    <details className="card"><summary className="cursor-pointer font-semibold">How to play</summary><div className="mt-3 flex flex-col gap-3 text-sm text-slate-600"><p>Each player throws at their running double: {DOUBLES_SEQUENCE.map(d => `D${d}`).join(" → ")}.</p><p>After these {DOUBLES_SEQUENCE.length} targets, random doubles follow until you end the game. Each player advances independently, taking turns in your chosen order.</p><p>Throw up to three darts and choose one visit outcome: Hit on dart 1 (3 points), dart 2 (2 points), dart 3 (1 point), or Missed all 3 (0 points).</p><p>For a fair group result, finish the current round so everyone has the same number of turns. Pause to continue later.</p></div></details>
    <SavedSessions sessions={sessions} players={players} modeFilter={false} retryHref="/practice/doubles" kind="results" />
    <details className="card"><summary className="cursor-pointer font-semibold">Player records</summary>{records.status === "rejected" ? <p role="alert" className="mt-3">Records could not be loaded. <Link href="/practice/doubles" className="underline">Retry</Link></p> : stats.length ? <ul className="mt-3 divide-y divide-slate-200">{stats.map(p => <li key={p.player_id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words"><strong>{p.name}</strong><span className="block text-slate-600">Doubles {p.double_pct ?? "–"}% · First dart {p.first_dart_pct ?? "–"}%{p.weakest_doubles.length ? ` · Practice ${p.weakest_doubles.map(d => `D${d}`).join(", ")}` : ""}</span></span><span>{p.games_won} won · {p.games_played} played</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No completed games yet.</p>}</details>
  </main>;
}
