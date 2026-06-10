export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getPlayerCards, getTeamCard } from "@/data/stats";
import { StatBar } from "@/components/StatBar";
import { ChartCard } from "./ChartCard";
import { ExportLinks } from "./ExportLinks";
import { ScoringBreakdown } from "./ScoringBreakdown";
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
    <main className="flex flex-col gap-4 fade-up">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Team HQ</p>
          <h1 className="text-2xl font-bold">Dashboard</h1>
        </div>
        {currentSeason ? (
          <span className="chip border border-emerald-200 bg-emerald-50 text-emerald-700">
            Season {currentSeason.name}
          </span>
        ) : (
          <a href="/settings" className="chip border border-amber-200 bg-amber-50 text-amber-700 underline">
            Set active season
          </a>
        )}
      </header>

      <section className="grid grid-cols-1 gap-3">
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Team snapshot</h2>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Legs W/L</p>
              <p className="mt-1 text-xl font-bold">
                {team.legs_won ?? 0}<span className="text-slate-500">/</span>{team.legs_played ? team.legs_played - (team.legs_won ?? 0) : 0}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Win rate</p>
              <p className={`mt-1 text-xl font-bold ${winRate !== null && winRate >= 50 ? "text-emerald-700" : winRate !== null ? "text-red-600" : ""}`}>
                {winRate !== null ? winRate.toFixed(0) + "%" : "–"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">3DA</p>
              <p className="mt-1 text-xl font-bold">{team.three_dart_avg ? team.three_dart_avg.toFixed(1) : "–"}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Checkout</p>
              <p className="mt-1 text-xl font-bold">
                {team.checkout_pct !== null ? team.checkout_pct.toFixed(0) + "%" : "–"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Darts/leg</p>
              <p className="mt-1 text-xl font-bold">
                {team.darts_per_leg_won !== null ? team.darts_per_leg_won.toFixed(1) : "–"}
              </p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">High finish</p>
              <p className="mt-1 text-xl font-bold text-amber-700">{team.high_finish ?? "–"}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href="/fixtures"
            className="card flex items-center justify-between !p-4 transition hover:border-emerald-300 active:scale-[0.98]"
          >
            <span className="font-semibold">📅 Fixtures</span>
            <span className="text-emerald-700">→</span>
          </Link>
          <Link
            href="/practice"
            className="card flex items-center justify-between !p-4 transition hover:border-purple-300 active:scale-[0.98]"
          >
            <span className="font-semibold">🎯 Practice</span>
            <span className="text-purple-700">→</span>
          </Link>
          <Link
            href="/players"
            className="card flex items-center justify-between !p-4 transition hover:border-emerald-300 active:scale-[0.98]"
          >
            <span className="font-semibold">👥 Players</span>
            <span className="text-emerald-700">→</span>
          </Link>
          <Link
            href="/pub-games/killer"
            className="card flex items-center justify-between !p-4 transition hover:border-amber-300 active:scale-[0.98]"
          >
            <span className="font-semibold">💀 Killer</span>
            <span className="text-amber-700">→</span>
          </Link>
        </div>
      </section>

      {/* Scoring breakdown */}
      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Scoring breakdown</h2>
        <ScoringBreakdown
          team={{
            sixty_plus: team.sixty_plus,
            hundred_plus: team.hundred_plus,
            hundred_forty_plus: team.hundred_forty_plus,
            one_eighty_count: team.one_eighty_count,
          }}
          players={players.map((p) => ({
            player_id: p.player_id,
            name: p.name,
            sixty_plus: p.sixty_plus,
            hundred_plus: p.hundred_plus,
            hundred_forty_plus: p.hundred_forty_plus,
            one_eighty: p.one_eighty,
          }))}
        />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Leaderboard <span className="text-xs font-normal text-slate-500">by 3-dart average</span></h2>
        <div className="grid grid-cols-1 gap-2 max-h-[600px] overflow-y-auto pr-1">
          {playersBy3da.map((p, rank) => {
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
                    <p className="flex items-center gap-2 font-semibold">
                      <span
                        className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                          rank === 0
                            ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300"
                            : rank === 1
                            ? "bg-slate-100 text-slate-800 ring-1 ring-slate-300"
                            : rank === 2
                            ? "bg-amber-50 text-amber-600"
                            : "bg-slate-50 text-slate-500"
                        }`}
                      >
                        {rank + 1}
                      </span>
                      {p.name}
                    </p>
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
        <ChartCard title="3-Dart Average (by player)" data={chartData} color="#12b886" />
        <ChartCard title="First 9 Average (by player)" data={first9Data} color="#ffd43b" />
        <ChartCard title="26s Hit (by player)" data={t26Data} color="#9775fa" />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Exports</h2>
        <ExportLinks seasons={seasons} fixtures={fixtures} currentSeasonId={currentSeasonId} />
      </section>
    </main>
  );
}
