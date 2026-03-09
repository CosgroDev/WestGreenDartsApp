import Link from "next/link";
import { notFound } from "next/navigation";
import { getPracticeSessions } from "@/data/practice";
import { getPlayers } from "@/data/players";
import { createPracticeSessionAction, deletePracticeSessionAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PracticePage() {
  const [sessions, players] = await Promise.all([getPracticeSessions(), getPlayers()]);

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <p className="text-sm text-slate-600">Practice arena</p>
        <h1 className="text-2xl font-semibold">Practice sessions</h1>
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Start a session</h2>
        <form action={createPracticeSessionAction} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-700" htmlFor="playerA">
              Player A (WGD)
            </label>
            <select id="playerA" name="playerA" className="rounded-md border border-slate-300 px-3 py-2">
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-700" htmlFor="playerB">
              Player B (WGD)
            </label>
            <select id="playerB" name="playerB" className="rounded-md border border-slate-300 px-3 py-2">
              <option value="">Select player</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-700" htmlFor="startScore">
              Start score
            </label>
            <select id="startScore" name="startScore" className="rounded-md border border-slate-300 px-3 py-2" defaultValue="501">
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
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-4 py-3 text-white font-semibold hover:bg-emerald-700 w-full sm:col-span-2"
          >
            Start practice
          </button>
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Recent sessions</h2>
        {!sessions.length ? (
          <p className="text-sm text-slate-600">No practice sessions yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                <div className="flex flex-col">
                  <span className="font-semibold">
                    {s.player_a_name || "Player A"} vs {s.player_b_name || "Player B"}
                  </span>
                  <span className="text-slate-600">
                    {s.start_score} · {s.legs_to_play} leg(s) · {s.status}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/practice/scoring?session=${s.id}`}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 font-semibold"
                  >
                    Open
                  </Link>
                  <form action={deletePracticeSessionAction}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button
                      className="rounded-full border border-slate-300 w-8 h-8 flex items-center justify-center text-slate-500 hover:border-red-200 hover:text-red-600"
                      title="Delete session (only if no active games)"
                    >
                      ×
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
