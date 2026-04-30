export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getPlayerCards, getTeamCard } from "@/data/stats";
import { StatBar } from "@/components/StatBar";
import { ChartCard } from "./ChartCard";
import { ExportLinks } from "./ExportLinks";
import { getSeasons } from "@/data/seasons";
import { getFixtures } from "@/data/fixtures";

export default async function DashboardPage() {
  const [seasons, fixtures] = await Promise.all([getSeasons(), getFixtures()]);
  const currentSeason = seasons.find((s) => s.is_current);
  const currentSeasonId = currentSeason?.id ?? "";

  const [players, team] = await Promise.all([
    getPlayerCards(currentSeasonId || undefined),
    getTeamCard(currentSeasonId || undefined)
  ]);
  const playersBy3da = [...players].sort((a, b) => (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0));
  const playersByFirst9 = [...players].sort((a, b) => (b.first_nine_avg ?? 0) - (a.first_nine_avg ?? 0));
  const playersBy26 = [...players].sort((a, b) => (b.twenty_six ?? 0) - (a.twenty_six ?? 0));
  const playersBy180 = [...players]
    .filter((p) => (p.one_eighty ?? 0) > 0)
    .sort((a, b) => (b.one_eighty ?? 0) - (a.one_eighty ?? 0));
  const chartData = playersBy3da.slice(0, 6).map((p) => ({ label: p.name || "—", value: p.three_dart_avg ?? 0 }));
  const first9Data = playersByFirst9
    .slice(0, 6)
    .map((p) => ({ label: p.name || "—", value: p.first_nine_avg ?? 0 }));
  const t26Data = playersBy26.slice(0, 6).map((p) => ({ label: p.name || "—", value: p.twenty_six ?? 0 }));

  const winRate = team.legs_played > 0 ? (team.legs_won / team.legs_played) * 100 : null;

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <p className="text-sm text-slate-600">Overview</p>
        <h1 className="text-2xl font-semibold">Team Dashboard</h1>
        {currentSeason ? (
          <p className="mt-1 text-sm text-emerald-700 font-medium">Season {currentSeason.name}</p>
        ) : (
          <p className="mt-1 text-sm text-amber-600">No active season set — <a href="/settings" className="underline">configure in settings</a></p>
        )}
      </header>

      <section className="grid grid-cols-1 gap-3">
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Team snapshot</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-slate-600">Legs (W/L)</p>
              <p className="text-xl font-semibold">
                {team.legs_won ?? 0} / {team.legs_played ? team.legs_played - (team.legs_won ?? 0) : 0}
              </p>
            </div>
            <div>
              <p className="text-slate-600">Win rate</p>
              <p className={`text-xl font-semibold ${winRate !== null && winRate >= 50 ? "text-emerald-700" : winRate !== null ? "text-red-600" : ""}`}>
                {winRate !== null ? winRate.toFixed(0) + "%" : "–"}
              </p>
            </div>
            <div>
              <p className="text-slate-600">3DA</p>
              <p className="text-xl font-semibold">{team.three_dart_avg ? team.three_dart_avg.toFixed(1) : "–"}</p>
            </div>
            <div>
              <p className="text-slate-600">Checkout %</p>
              <p className="text-xl font-semibold">
                {team.checkout_pct !== null ? team.checkout_pct.toFixed(0) + "%" : "–"}
              </p>
            </div>
            <div>
              <p className="text-slate-600">Darts / leg won</p>
              <p className="text-xl font-semibold">
                {team.darts_per_leg_won !== null ? team.darts_per_leg_won.toFixed(1) : "–"}
              </p>
            </div>
            <div>
              <p className="text-slate-600">High finish</p>
              <p className="text-xl font-semibold">{team.high_finish ?? "–"}</p>
            </div>
          </div>
        </div>

        <div className="card grid grid-cols-2 gap-2">
          <Link
            href="/fixtures"
            className="rounded-md bg-emerald-600 px-4 py-3 text-center text-white font-semibold hover:bg-emerald-700"
          >
            Fixtures
          </Link>
          <Link
            href="/players"
            className="rounded-md bg-slate-200 px-4 py-3 text-center text-slate-800 font-semibold hover:bg-slate-300"
          >
            Players
          </Link>
          <Link
            href="/practice"
            className="rounded-md bg-purple-200 px-4 py-3 text-center text-purple-900 font-semibold hover:bg-purple-300"
          >
            Practice arena
          </Link>
          <Link
            href="/pub-games/killer"
            className="rounded-md bg-amber-500 px-4 py-3 text-center text-white font-semibold hover:bg-amber-600"
          >
            Killer
          </Link>
        </div>
      </section>

      {/* Scoring breakdown */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Scoring breakdown</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">60+ visits</p>
            <p className="text-2xl font-bold text-slate-800">{team.sixty_plus}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
            <p className="text-xs text-emerald-700 font-medium uppercase tracking-wide">100+ tons</p>
            <p className="text-2xl font-bold text-emerald-800">{team.hundred_plus}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-3">
            <p className="text-xs text-purple-700 font-medium uppercase tracking-wide">140+ tons</p>
            <p className="text-2xl font-bold text-purple-800">{team.hundred_forty_plus}</p>
          </div>
          <div className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">180s</p>
            <p className="text-2xl font-bold text-amber-800">{team.one_eighty_count}</p>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Top players</h2>
        <div className="grid grid-cols-1 gap-2">
          {players.slice(0, 4).map((p) => {
            const winPct = p.legs_played > 0 ? (p.legs_won / p.legs_played) * 100 : null;
            const diff = (p.legs_won ?? 0) - ((p.legs_played ?? 0) - (p.legs_won ?? 0));
            const diffColor =
              diff > 0 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700";
            const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
            return (
              <div
                key={p.player_id}
                className="flex flex-col gap-3 rounded-md border border-slate-200 px-3 py-3 text-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="w-full sm:w-auto">
                    <p className="font-semibold">{p.name}</p>
                    <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <StatBar label="3DA" value={p.three_dart_avg} max={80} />
                      <StatBar label="First 9" value={p.first_nine_avg} max={100} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                      Won {p.legs_won}
                    </span>
                    <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-semibold">
                      Played {p.legs_played}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${diffColor}`}>
                      {diffLabel}
                    </span>
                    {winPct !== null && (
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${winPct >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                        {winPct.toFixed(0)}% win
                      </span>
                    )}
                  </div>
                </div>
                {/* Secondary stats row */}
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2">
                  {p.checkout_pct !== null && (
                    <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold">
                      CO {p.checkout_pct.toFixed(0)}%
                    </span>
                  )}
                  {p.darts_per_leg_won !== null && (
                    <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-semibold">
                      {p.darts_per_leg_won.toFixed(1)} darts/leg
                    </span>
                  )}
                  {p.hundred_plus > 0 && (
                    <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                      {p.hundred_plus} × 100+
                    </span>
                  )}
                  {p.hundred_forty_plus > 0 && (
                    <span className="rounded-full bg-purple-50 text-purple-700 px-3 py-1 text-xs font-semibold">
                      {p.hundred_forty_plus} × 140+
                    </span>
                  )}
                  {p.one_eighty > 0 && (
                    <span className="rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-xs font-semibold">
                      {p.one_eighty} × 180
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {!!playersBy180.length && (
        <section className="card">
          <h2 className="text-lg font-semibold mb-2">180s hit</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {playersBy180.slice(0, 6).map((p) => (
              <div
                key={p.player_id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="font-semibold">{p.name}</span>
                <span className="rounded-full bg-purple-50 text-purple-700 px-3 py-1 text-sm font-semibold">
                  {p.one_eighty} × 180
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="grid grid-cols-1 gap-3">
        <ChartCard title="3-Dart Average (by player)" data={chartData} color="#2f8f6d" />
        <ChartCard title="First 9 Average (by player)" data={first9Data} color="#4fb18d" />
        <ChartCard title="26s Hit (by player)" data={t26Data} color="#8b5cf6" />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Exports</h2>
        <ExportLinks seasons={seasons} fixtures={fixtures} currentSeasonId={currentSeasonId} />
      </section>
    </main>
  );
}
