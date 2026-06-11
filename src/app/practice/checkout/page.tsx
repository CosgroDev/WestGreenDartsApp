import Link from "next/link";
import { getPlayers } from "@/data/players";
import { getCheckoutPlayerStats } from "@/data/checkoutPractice";
import { startCheckoutGameAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckoutPage() {
  const [players, stats] = await Promise.all([getPlayers(), getCheckoutPlayerStats()]);

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
        <h1 className="text-2xl font-semibold">Random Checkout</h1>
        <p className="text-sm text-slate-500 mt-1">
          A random finish 2–170 each time — work out the route and take it down in 3 darts.
        </p>
      </header>

      {/* How to play */}
      <section className="card">
        <h2 className="text-base font-semibold mb-2 text-slate-700">How to play</h2>
        <ul className="text-sm text-slate-600 flex flex-col gap-1 list-none">
          <li>🎯 You get a random checkout and a suggested route</li>
          <li>🎯 Throw up to <strong>3 darts</strong> to finish it</li>
          <li>✅ Tap how many darts it took — or <strong>didn&apos;t finish</strong></li>
          <li>🔁 A new checkout is served each time, until you end</li>
        </ul>
      </section>

      {/* Start game */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Start a game</h2>
        <form action={startCheckoutGameAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-700" htmlFor="playerId">
              Select player
            </label>
            <select id="playerId" name="playerId" required className="rounded-md border border-slate-300 px-3 py-2">
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
            className="rounded-md bg-blue-600 px-4 py-3 text-white font-semibold hover:bg-blue-700"
          >
            Start Random Checkout
          </button>
        </form>
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
                    {p.avg_darts !== null && (
                      <span>Avg darts: <strong className="text-slate-700">{p.avg_darts}</strong></span>
                    )}
                    <span>{p.checkouts}/{p.attempts} finished</span>
                  </div>
                </div>
                {p.checkout_pct !== null && (
                  <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold">
                    {p.checkout_pct}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
