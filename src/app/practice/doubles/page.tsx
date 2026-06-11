import Link from "next/link";
import { getPlayers } from "@/data/players";
import { getDoublesPlayerStats } from "@/data/doublesPractice";
import { DOUBLES_SEQUENCE } from "@/lib/doublesPractice";
import DoublesStartForm from "./DoublesStartForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoublesPage() {
  const [players, stats] = await Promise.all([getPlayers(), getDoublesPlayerStats()]);

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-slate-600">Practice arena</p>
          <Link
            href="/practice"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800"
          >
            ← Practice
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Doubles Switch</h1>
        <p className="text-sm text-slate-500 mt-1">
          Rotate through the finishing doubles, then random ones — get used to switching.
        </p>
      </header>

      {/* How to play */}
      <section className="card">
        <h2 className="text-base font-semibold mb-2 text-slate-700">How to play</h2>
        <ul className="text-sm text-slate-600 flex flex-col gap-1 list-none">
          <li>🎯 Each player throws at the running double: {DOUBLES_SEQUENCE.map((d) => `D${d}`).join(" → ")}</li>
          <li>🎲 After the {DOUBLES_SEQUENCE.length} in order, you get <strong>random</strong> doubles until you end</li>
          <li>🎯 Up to <strong>3 darts</strong> per double — tap the dart that hits, or miss all 3</li>
          <li>🏆 Earlier hits score more: <strong>1st = 3</strong>, 2nd = 2, 3rd = 1</li>
          <li>🔁 Players take turns in order; everyone advances independently</li>
        </ul>
      </section>

      {/* Start game */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Start a game</h2>
        <DoublesStartForm players={players.map((p) => ({ id: p.id, name: p.name }))} />
      </section>

      {/* Player stats */}
      {stats.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold mb-3">Player stats</h2>
          <div className="flex flex-col gap-2">
            {stats.map((p) => (
              <div
                key={p.player_id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm"
              >
                <div>
                  <p className="font-semibold">{p.name}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-slate-500 mt-0.5">
                    {p.double_pct !== null && (
                      <span>Doubles: <strong className="text-slate-700">{p.double_pct}%</strong></span>
                    )}
                    {p.first_dart_pct !== null && (
                      <span>1st dart: <strong className="text-slate-700">{p.first_dart_pct}%</strong></span>
                    )}
                    {p.weakest_doubles.length > 0 && (
                      <span>Weakest: <strong className="text-red-600">{p.weakest_doubles.map((d) => `D${d}`).join(", ")}</strong></span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  {p.games_won > 0 && (
                    <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                      🏆 {p.games_won}
                    </span>
                  )}
                  <span className="rounded-full bg-slate-100 text-slate-600 px-3 py-1 text-xs font-semibold">
                    {p.games_played} played
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
