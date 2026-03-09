import Link from "next/link";
import { getPlayers } from "@/data/players";
import { get121PlayerStats } from "@/data/game121";
import { start121GameAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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
            <Button variant="outline" size="xs" asChild>
              <Link href="/practice">← Practice</Link>
            </Button>
            <Button variant="outline" size="xs" asChild>
              <Link href="/dashboard">← Dashboard</Link>
            </Button>
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
            <Label htmlFor="playerId">Select player</Label>
            <select
              id="playerId"
              name="playerId"
              required
              className="flex h-10 w-full rounded-md border border-slate-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">-- Select player --</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" size="lg" className="bg-purple-600 hover:bg-purple-700 text-white">
            Start 121
          </Button>
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
                    <Badge variant="practice">🏆 {p.games_won} win{p.games_won !== 1 ? "s" : ""}</Badge>
                  )}
                  <Badge variant="neutral">{p.games_played} played</Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
