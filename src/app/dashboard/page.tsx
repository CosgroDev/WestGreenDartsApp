export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getDashboardStatistics } from "@/data/dashboard";
import { Suspense, type ReactNode } from "react";
import { ResumeMatch } from "./ResumeMatch";
import { PerformanceCharts } from "./PerformanceCharts";
import { buildPerformanceLeaderboard } from "@/lib/playerPerformance";
import { buildPlayerAuras } from "@/lib/playerAura";
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
  const performance = buildPerformanceLeaderboard(players);
  const auras = Object.fromEntries(buildPlayerAuras(players));
  const playersByLegs = [...players].sort((a, b) => b.legs_won - a.legs_won);
  const formById = new Map(playerForm.map((f) => [f.player_id, f.matches.map((m) => m.result)]));
  const playersBy3da = [...players].sort((a, b) => (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0));
  const playersByFirst9 = [...players].sort((a, b) => (b.first_nine_avg ?? 0) - (a.first_nine_avg ?? 0));
  const playersBy26 = [...players].sort((a, b) => (b.twenty_six ?? 0) - (a.twenty_six ?? 0));
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

      <section className="grid grid-cols-1 gap-3">
        <div className="card">
          <h2 className="text-lg font-semibold mb-3">Team snapshot</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <SnapshotStat label="Won · Lost" value={<>{team.legs_won ?? 0}<span className="text-slate-500"> · </span>{team.legs_played ? team.legs_played - (team.legs_won ?? 0) : 0}</>} />
            <SnapshotStat
              label="Win rate"
              value={winRate !== null ? winRate.toFixed(0) + "%" : "–"}
              tone={winRate !== null && winRate >= 50 ? "text-emerald-700" : winRate !== null ? "text-red-600" : undefined}
            />
            <SnapshotStat label="3-dart avg" value={team.three_dart_avg ? team.three_dart_avg.toFixed(1) : "–"} />
            <SnapshotStat label="Checkout" value={team.checkout_pct !== null ? team.checkout_pct.toFixed(0) + "%" : "–"} />
            <SnapshotStat label="Darts per leg won" value={team.darts_per_leg_won !== null ? team.darts_per_leg_won.toFixed(1) : "–"} />
            <SnapshotStat label="High finish" value={team.high_finish ?? "–"} highlight />
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

      <section className="card">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <p className="mb-3 text-xs text-slate-500">Season performance · tap a player for full stats and ✨ AI insights</p>
        <Leaderboard
          players={players}
          performance={performance}
          auras={auras}
          formByPlayer={Object.fromEntries(formById)}
          seasonId={currentSeasonId}
        />
      </section>

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

      <LeagueSnapshot />

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

function SnapshotStat({
  label,
  value,
  tone,
  highlight,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl px-3 py-3 ${highlight ? "border border-amber-200 bg-amber-50" : "bg-slate-50"}`}>
      <p className={`text-2xl font-bold tabular-nums ${tone ?? (highlight ? "text-amber-700" : "")}`}>{value}</p>
      <p className={`mt-0.5 text-xs ${highlight ? "text-amber-700" : "text-slate-500"}`}>{label}</p>
    </div>
  );
}
