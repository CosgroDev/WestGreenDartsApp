import Link from "next/link";
import { getPracticeSessions, getPracticePlayerStats } from "@/data/practice";
import { getPlayers } from "@/data/players";
import { StatBar } from "@/components/StatBar";
import { createPracticeSessionAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PracticePage() {
  const [sessions, players, practiceStats] = await Promise.all([
    getPracticeSessions(),
    getPlayers(),
    getPracticePlayerStats(),
  ]);

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm text-slate-600">Practice arena</p>
          <Button variant="outline" size="xs" asChild>
            <Link href="/dashboard">← Dashboard</Link>
          </Button>
        </div>
        <h1 className="text-2xl font-semibold">Practice sessions</h1>
      </header>

      {/* Quick links to other practice games */}
      <section className="card">
        <h2 className="text-base font-semibold mb-2 text-slate-700">Practice games</h2>
        <Link
          href="/practice/121"
          className="flex items-center justify-between rounded-md border border-purple-200 bg-purple-50 px-4 py-3 hover:bg-purple-100"
        >
          <div>
            <p className="font-semibold text-purple-900">121 Challenge</p>
            <p className="text-xs text-purple-600 mt-0.5">Progress from checkout 121 → 170</p>
          </div>
          <span className="text-purple-700 font-semibold text-sm">Play →</span>
        </Link>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Start a session</h2>
        <form action={createPracticeSessionAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="playerA">Player A (WGD)</Label>
            <select id="playerA" name="playerA" className="flex h-10 w-full rounded-md border border-slate-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="playerB">Player B (WGD)</Label>
            <select id="playerB" name="playerB" className="flex h-10 w-full rounded-md border border-slate-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="startScore">Start score</Label>
            <select id="startScore" name="startScore" defaultValue="501" className="flex h-10 w-full rounded-md border border-slate-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="301">301</option>
              <option value="501">501</option>
              <option value="701">701</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <p className="text-sm text-slate-700">Legs to play</p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: "1", label: "1", sub: "single" },
                { value: "3", label: "3", sub: "best of 3" },
                { value: "5", label: "5", sub: "best of 5" },
                { value: "7", label: "7", sub: "best of 7" },
              ].map((opt) => (
                <label key={opt.value} className="cursor-pointer">
                  <input
                    type="radio"
                    name="legs"
                    value={opt.value}
                    defaultChecked={opt.value === "3"}
                    className="peer sr-only"
                  />
                  <span className="flex flex-col items-center justify-center rounded-md border border-slate-300 px-2 py-3 text-center text-slate-700 hover:border-emerald-300 peer-checked:border-emerald-500 peer-checked:bg-emerald-600 peer-checked:text-white">
                    <span className="text-xl font-bold leading-none">{opt.label}</span>
                    <span className="text-xs mt-1 opacity-75">{opt.sub}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" size="lg" className="w-full sm:col-span-2">
            Start practice
          </Button>
        </form>
      </section>

      {practiceStats.length > 0 && (
        <>
          <section className="card">
            <h2 className="text-lg font-semibold mb-3">Player stats</h2>
            <div className="flex flex-col gap-2">
              {practiceStats.map((p) => {
                const diff = p.legs_won - (p.legs_played - p.legs_won);
                const diffColor = diff > 0 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700";
                const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
                return (
                  <div key={p.player_id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-slate-200 px-3 py-3 text-sm">
                    <div className="w-full sm:w-auto">
                      <p className="font-semibold">{p.name}</p>
                      <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <StatBar label="3DA" value={p.three_dart_avg} max={80} />
                        <StatBar label="First 9" value={p.first_nine_avg} max={100} />
                      </div>
                      <div className="mt-1 flex gap-3 text-xs text-slate-500">
                        {p.high_finish && <span>High finish: <strong className="text-slate-700">{p.high_finish}</strong></span>}
                        {p.twenty_six > 0 && <span>26s: <strong className="text-slate-700">{p.twenty_six}</strong></span>}
                        {p.one_eighty > 0 && <span className="text-purple-700">180s: <strong>{p.one_eighty}</strong></span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="win" className="px-4 py-1.5 text-sm">Won {p.legs_won}</Badge>
                      <Badge variant="neutral" className="px-4 py-1.5 text-sm">Played {p.legs_played}</Badge>
                      <Badge variant={diff > 0 ? "win" : diff < 0 ? "loss" : "neutral"} className="px-4 py-1.5 text-sm">
                        {diffLabel}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {practiceStats.some((p) => p.one_eighty > 0) && (
            <section className="card">
              <h2 className="text-lg font-semibold mb-2">180s hit</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {practiceStats
                  .filter((p) => p.one_eighty > 0)
                  .map((p) => (
                    <div key={p.player_id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <span className="font-semibold">{p.name}</span>
                      <Badge variant="practice">{p.one_eighty} × 180</Badge>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </>
      )}

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Recent sessions</h2>
        {!sessions.length ? (
          <p className="text-sm text-slate-600">No practice sessions yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2.5 text-sm">
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {s.player_a_name || "Player A"} vs {s.player_b_name || "Player B"}
                  </span>
                  <span className="text-slate-500 text-xs mt-0.5">
                    {s.start_score} · {s.legs_to_play} leg{s.legs_to_play !== 1 ? "s" : ""} · {s.status}
                  </span>
                </div>
                <Link
                  href={`/practice/scoring?session=${s.id}`}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm text-white font-semibold hover:bg-emerald-700"
                >
                  Open
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
