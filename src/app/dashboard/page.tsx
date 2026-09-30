export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getDashboardStatistics } from "@/data/dashboard";
import { Suspense } from "react";
import { ResumeMatch } from "./ResumeMatch";
import { PerformanceCharts } from "./PerformanceCharts";
import { compareLeaderboardPlayers } from "@/lib/leaderboard";
import { FormPills } from "@/components/FormPills";
import { ExportLinks } from "./ExportLinks";
import { ScoringBreakdown } from "./ScoringBreakdown";
import { Leaderboard } from "./Leaderboard";
import { HonoursBoard } from "./HonoursBoard";
import { LeagueSnapshot } from "./LeagueSnapshot";
import { SeasonAiSummary } from "./SeasonAiSummary";
import { getSeasons } from "@/data/seasons";
import { getFixtures } from "@/data/fixtures";
import { getStoredSeasonSummary } from "@/data/seasonSummary";

export default async function DashboardPage() {
  const seasons = await getSeasons();
  const currentSeason = seasons.find(s => s.is_current);
  const currentSeasonId = currentSeason?.id ?? "";
  const [{ players, team, playerForm, seasonToDate }, storedSeasonSummary, fixtures] = await Promise.all([
    getDashboardStatistics(currentSeasonId || undefined),
    currentSeasonId ? getStoredSeasonSummary(currentSeasonId) : Promise.resolve({ summary: null, at: null, fixtures: null }),
    getFixtures(undefined, false)
  ]);
  const playersByWinPct = [...players].sort(compareLeaderboardPlayers);
  const playersByLegs = [...players].sort((a, b) => b.legs_won - a.legs_won);
  const formById = new Map(playerForm.map((f) => [f.player_id, f.matches.map((m) => m.result)]));
  const playersBy3da = [...players].sort((a, b) => (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0));
  const playersByFirst9 = [...players].sort((a, b) => (b.first_nine_avg ?? 0) - (a.first_nine_avg ?? 0));
  const playersBy26 = [...players].sort((a, b) => (b.twenty_six ?? 0) - (a.twenty_six ?? 0));
  const playersBy180 = [...players]
    .filter((p) => (p.one_eighty ?? 0) > 0)
    .sort((a, b) => (b.one_eighty ?? 0) - (a.one_eighty ?? 0));
  const chartData = playersBy3da
    .slice(0, 6)
    .map((p) => ({ label: p.name || "—", value: Math.round((p.three_dart_avg ?? 0) * 10) / 10 }));
  const first9Data = playersByFirst9
    .slice(0, 6)
    .map((p) => ({ label: p.name || "—", value: Math.round((p.first_nine_avg ?? 0) * 10) / 10 }));
  const t26Data = playersBy26.slice(0, 6).map((p) => ({ label: p.name || "—", value: p.twenty_six ?? 0 }));
  const legsWonData = playersByLegs
    .slice(0, 8)
    .map((p) => ({ label: p.name || "—", value: p.legs_won ?? 0 }));
  const checkoutData = [...players]
    .filter((p) => p.checkout_pct !== null)
    .sort((a, b) => (b.checkout_pct ?? 0) - (a.checkout_pct ?? 0))
    .slice(0, 8)
    .map((p) => ({ label: p.name || "—", value: Math.round(p.checkout_pct ?? 0) }));

  // Hottest player: most wins across their last 5 matches (needs at least 2 played)
  const hotPlayer = playerForm
    .filter((f) => f.matches.length >= 2)
    .map((f) => {
      const last5 = f.matches.slice(0, 5).map((m) => m.result);
      const wins = last5.filter((r) => r === "W").length;
      let streak = 0;
      for (const r of f.matches.map((m) => m.result)) {
        if (r === "W") streak += 1;
        else break;
      }
      return { ...f, wins, streak, played: last5.length };
    })
    .sort((a, b) => b.wins - a.wins || b.streak - a.streak)[0];

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

      <Suspense fallback={<div className="card text-sm text-slate-600" role="status">Checking for a live match…</div>}><ResumeMatch /></Suspense>

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

      <Link href="/league-insights" className="card flex items-center justify-between gap-3">
        <div><p className="font-semibold">League insights</p><p className="mt-1 text-sm text-slate-600">Team form, head-to-head results and upcoming fixture estimates</p></div>
        <span className="text-emerald-800">→</span>
      </Link>
      <LeagueSnapshot />

      {seasonToDate && seasonToDate.anomalies.length > 0 && (
        <section className="card !border-red-200 !bg-red-50">
          <h2 className="text-sm font-semibold text-red-800">⚠️ Fixture data needs a look</h2>
          <p className="mt-1 text-sm text-red-700">
            {seasonToDate.anomalies.length === 1 ? "This fixture has" : "These fixtures have"} every match settled
            but not 6 results — a match was likely deleted and never re-entered, so it's left out of the season
            record and AI summary until it's fixed:
          </p>
          <ul className="mt-2 space-y-1 text-sm text-red-700">
            {seasonToDate.anomalies.map((a) => (
              <li key={a.fixtureId}>
                <Link href={`/fixtures/${a.fixtureId}`} className="underline">
                  {new Date(a.startsAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} vs{" "}
                  {a.opponent}
                </Link>{" "}
                — {a.matchesFound} of 6 matches found
              </li>
            ))}
          </ul>
        </section>
      )}

      {currentSeasonId && (
        <details className="card !border-amber-200" style={{ boxShadow: "0 0 24px rgba(255, 212, 59, 0.08)" }}>
          <summary className="cursor-pointer text-lg font-semibold mb-2">✨ AI season summary</summary>
          <SeasonAiSummary
            seasonId={currentSeasonId}
            configured={Boolean(process.env.ANTHROPIC_API_KEY)}
            completedFixtures={seasonToDate?.completedFixtures ?? 0}
            initialSummary={storedSeasonSummary.summary}
            initialAt={storedSeasonSummary.at}
            initialFixtures={storedSeasonSummary.fixtures}
          />
        </details>
      )}

      {hotPlayer && hotPlayer.wins > 0 && (
        <section
          className="card !border-amber-200"
          style={{ boxShadow: "0 0 28px rgba(255, 212, 59, 0.1)" }}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">🔥 On fire</p>
              <p className="mt-1 text-xl font-bold">{hotPlayer.name}</p>
              <p className="text-sm text-slate-600">
                {hotPlayer.wins} win{hotPlayer.wins === 1 ? "" : "s"} in their last {hotPlayer.played} match
                {hotPlayer.played === 1 ? "" : "es"}
                {hotPlayer.streak >= 2 ? ` · on a ${hotPlayer.streak}-match streak` : ""}
              </p>
            </div>
            <FormPills form={hotPlayer.matches.map((m) => m.result)} />
          </div>
        </section>
      )}

      <HonoursBoard players={players} seasonName={currentSeason?.name} />

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
        <h2 className="text-lg font-semibold mb-2">
          Leaderboard <span className="text-xs font-normal text-slate-500">by leg win % · tap a player for game-by-game</span>
        </h2>
        <Leaderboard
          players={playersByWinPct}
          formByPlayer={Object.fromEntries(formById)}
          seasonId={currentSeasonId}
        />
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

      <PerformanceCharts charts={[
        { title: "Legs won", subtitle: "who’s putting points on the board", data: legsWonData, color: "#12b886" },
        { title: "Checkout %", subtitle: "composure on the doubles", data: checkoutData, color: "#ffd43b", suffix: "%" },
        { title: "3-Dart Average", subtitle: "overall scoring power", data: chartData, color: "#2fc08a" },
        { title: "First 9 Average", subtitle: "who starts a leg fastest", data: first9Data, color: "#d9a52b" },
        { title: "26s Hit", subtitle: "the wall of shame", data: t26Data, color: "#9775fa" }
      ]} />

      <details className="card">
        <summary className="cursor-pointer text-lg font-semibold">Exports</summary>
        <ExportLinks seasons={seasons} fixtures={fixtures} currentSeasonId={currentSeasonId} />
      </details>
    </main>
  );
}
