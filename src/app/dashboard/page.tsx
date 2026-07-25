export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getPlayerCards, getTeamCard } from "@/data/stats";
import { getPlayerForm } from "@/data/form";
import { FormPills } from "@/components/FormPills";
import { BarChartCard } from "./BarChartCard";
import { ExportLinks } from "./ExportLinks";
import { ScoringBreakdown } from "./ScoringBreakdown";
import { Leaderboard } from "./Leaderboard";
import { SeasonAiSummary } from "./SeasonAiSummary";
import { getSeasons } from "@/data/seasons";
import { getFixtures } from "@/data/fixtures";
import { getSeasonToDate, getStoredSeasonSummary } from "@/data/seasonSummary";

export default async function DashboardPage() {
  const [seasons, fixtures] = await Promise.all([getSeasons(), getFixtures()]);
  const currentSeason = seasons.find((s) => s.is_current);
  const currentSeasonId = currentSeason?.id ?? "";

  const [seasonToDate, storedSeasonSummary] = await Promise.all([
    currentSeasonId ? getSeasonToDate(currentSeasonId) : Promise.resolve(null),
    currentSeasonId
      ? getStoredSeasonSummary(currentSeasonId)
      : Promise.resolve({ summary: null, at: null, fixtures: null })
  ]);

  const [players, team, playerForm] = await Promise.all([
    getPlayerCards(currentSeasonId || undefined),
    getTeamCard(currentSeasonId || undefined),
    getPlayerForm()
  ]);
  const winPctOf = (p: (typeof players)[number]) => (p.legs_played > 0 ? p.legs_won / p.legs_played : 0);
  const playersByLegs = [...players].sort(
    (a, b) =>
      (b.legs_won ?? 0) - (a.legs_won ?? 0) ||
      winPctOf(b) - winPctOf(a) ||
      (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0)
  );
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

  const best = <T,>(arr: T[], value: (p: T) => number | null, dir: 1 | -1 = 1) =>
    arr.reduce<T | null>((acc, p) => {
      const v = value(p);
      if (v === null) return acc;
      if (acc === null) return p;
      const a = value(acc);
      return a === null || v * dir > a * dir ? p : acc;
    }, null);
  const highFinishLeader = best(players, (p) => p.high_finish);
  const checkoutLeader = best(players, (p) => p.checkout_pct);
  const fastestLeader = best(players, (p) => p.darts_per_leg_won, -1);
  // Ton machine is rate-based so heavy schedules don't dominate:
  // fewest darts thrown per 100+ visit (includes 140+ and 180s).
  const tonsLeader = best(
    players,
    (p) => (p.hundred_plus > 0 && p.total_darts > 0 ? p.total_darts / p.hundred_plus : null),
    -1
  );

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
        <section className="card !border-amber-200" style={{ boxShadow: "0 0 24px rgba(255, 212, 59, 0.08)" }}>
          <h2 className="text-lg font-semibold mb-2">✨ AI season summary</h2>
          <SeasonAiSummary
            seasonId={currentSeasonId}
            configured={Boolean(process.env.ANTHROPIC_API_KEY)}
            completedFixtures={seasonToDate?.completedFixtures ?? 0}
            initialSummary={storedSeasonSummary.summary}
            initialAt={storedSeasonSummary.at}
            initialFixtures={storedSeasonSummary.fixtures}
          />
        </section>
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

      {(highFinishLeader || checkoutLeader || fastestLeader || tonsLeader) && (
        <section className="card">
          <h2 className="text-lg font-semibold mb-3">Honours board</h2>
          <div className="grid grid-cols-2 gap-2">
            {highFinishLeader && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">🎯 Highest finish</p>
                <p className="mt-1 text-2xl font-bold text-amber-700">{highFinishLeader.high_finish}</p>
                <p className="text-xs text-slate-600">{highFinishLeader.name}</p>
              </div>
            )}
            {checkoutLeader && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">🧊 Coolest finisher</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">
                  {(checkoutLeader.checkout_pct ?? 0).toFixed(0)}%
                </p>
                <p className="text-xs text-slate-600">{checkoutLeader.name} · checkout rate</p>
              </div>
            )}
            {fastestLeader && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">⚡ Fastest finisher</p>
                <p className="mt-1 text-2xl font-bold text-blue-700">
                  {(fastestLeader.darts_per_leg_won ?? 0).toFixed(1)}
                </p>
                <p className="text-xs text-slate-600">{fastestLeader.name} · darts per leg won</p>
              </div>
            )}
            {tonsLeader && (
              <div className="rounded-2xl border border-purple-200 bg-purple-50 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-700">💯 Ton machine</p>
                <p className="mt-1 text-2xl font-bold text-purple-700">
                  {(tonsLeader.total_darts / tonsLeader.hundred_plus).toFixed(0)}
                  <span className="text-sm font-semibold"> darts</span>
                </p>
                <p className="text-xs text-slate-600">
                  {tonsLeader.name} · a 100+ every {(tonsLeader.total_darts / tonsLeader.hundred_plus).toFixed(0)} darts
                  ({tonsLeader.hundred_plus} in total)
                </p>
              </div>
            )}
          </div>
        </section>
      )}

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
          Leaderboard <span className="text-xs font-normal text-slate-500">by legs won · tap a player for game-by-game</span>
        </h2>
        <Leaderboard
          players={playersByLegs}
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

      <section className="grid grid-cols-1 gap-3">
        {legsWonData.length > 0 && (
          <BarChartCard
            title="Legs won"
            subtitle="who's putting points on the board"
            data={legsWonData}
            color="#12b886"
          />
        )}
        {checkoutData.length > 0 && (
          <BarChartCard
            title="Checkout %"
            subtitle="composure on the doubles"
            data={checkoutData}
            color="#ffd43b"
            suffix="%"
          />
        )}
        <BarChartCard title="3-Dart Average" subtitle="overall scoring power" data={chartData} color="#2fc08a" />
        <BarChartCard title="First 9 Average" subtitle="who starts a leg fastest" data={first9Data} color="#d9a52b" />
        <BarChartCard title="26s Hit" subtitle="the wall of shame" data={t26Data} color="#9775fa" />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Exports</h2>
        <ExportLinks seasons={seasons} fixtures={fixtures} currentSeasonId={currentSeasonId} />
      </section>
    </main>
  );
}
