import Link from "next/link";
import { getPlayers } from "@/data/players";
import { get121PlayerStats } from "@/data/game121";
import { start121GameAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Game121Page() {
  const [players, stats] = await Promise.all([getPlayers(), get121PlayerStats()]);

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-slate-600">Practice arena</p>
          <div className="flex gap-2">
            <Link
              href="/practice"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800"
            >
              ← Practice
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
        <h1 className="text-2xl font-semibold">121 Challenge</h1>
        <p className="text-sm text-slate-500 mt-1">
          Progress from checkout 121 to 170. Lock your base by finishing on Turn 1!
        </p>
      </header>

      {/* How to play */}
      <section className="card">
        <h2 className="text-base font-semibold mb-2 text-slate-700">How to play</h2>
        <ul className="text-sm text-slate-600 flex flex-col gap-1 list-none">
          <li>🎯 Start at checkout <strong>121</strong>, work up to <strong>170</strong></li>
          <li>🔄 You have <strong>3 turns</strong> (9 darts) to finish each checkout</li>
          <li>🔒 Finish on <strong>Turn 1</strong> → new checkout becomes your locked base</li>
          <li>✓ Finish on <strong>Turn 2 or 3</strong> → move up, base stays the same</li>
          <li>✗ <strong>Fail</strong> → return to your base checkout</li>
        </ul>
      </section>

      {/* Start game */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Start a game</h2>
        <form action={start121GameAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-700" htmlFor="playerId">
              Select player
            </label>
            <select
              id="playerId"
              name="playerId"
              required
              className="rounded-md border border-slate-300 px-3 py-2"
            >
              <option value="">-- Select player --</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="rounded-md bg-purple-600 px-4 py-3 text-white font-semibold hover:bg-purple-700"
          >
            Start 121
          </button>
        </form>
      </section>

      {/* Player stats */}
      {stats.length > 0 && (
        <section className="card">
          <h2 className="text-lg font-semibold mb-3">Player stats</h2>
          <div className="flex flex-col gap-2">
            {stats.map((p, i) => (
              <div
                key={p.player_id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-semibold w-5 text-center">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <div className="flex gap-3 text-xs text-slate-500 mt-0.5">
                      {p.best_checkout && (
                        <span>Best: <strong className="text-slate-700">{p.best_checkout}</strong></span>
                      )}
                      {p.lock_rate !== null && (
                        <span>Lock rate: <strong className="text-slate-700">{p.lock_rate}%</strong></span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  {p.games_won > 0 && (
                    <span className="rounded-full bg-purple-50 text-purple-700 px-3 py-1 text-xs font-semibold">
                      🏆 {p.games_won} win{p.games_won !== 1 ? "s" : ""}
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
