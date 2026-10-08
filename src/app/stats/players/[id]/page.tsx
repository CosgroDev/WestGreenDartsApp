export const dynamic = "force-dynamic";
export const revalidate = 0;
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPlayers } from "@/data/players";
import { getSeasons } from "@/data/seasons";
import { getPlayerCards, getPlayerGameLog } from "@/data/stats";
import { getProfileMatches, getProfilePractice } from "@/data/playerProfile";
import { buildPerformanceLeaderboard } from "@/lib/playerPerformance";
import { FormPills } from "@/components/FormPills";
import { StatsSeasonFilter } from "../../StatsSeasonFilter";
import { PerformanceCharts } from "@/app/dashboard/PerformanceCharts";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ season?: string; view?: string }> };
const dateLabel = (date: string) => new Date(date).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", year: "numeric" });
export default async function PlayerProfile({ params, searchParams }: Props) {
  const [{ id }, query, roster, seasons] = await Promise.all([params, searchParams, getPlayers(), getSeasons()]);
  const player = roster.find(p => p.id === id);
  if (!player) notFound();
  const season = query.season === "all" ? undefined : seasons.find(s => s.id === query.season || s.name === query.season) ?? seasons.find(s => s.is_current);
  const seasonContext = season?.id ?? "all";
  const view = ["overview", "matches", "practice"].includes(query.view || "") ? query.view! : "overview";
  const [cards, matches, log, practice] = await Promise.all([
    getPlayerCards(season?.id, true), getProfileMatches(id, season?.id), getPlayerGameLog(id, season?.id),
    view === "practice" ? getProfilePractice(id) : Promise.resolve([])
  ]);
  const stats = cards.find(card => card.player_id === id);
  const rating = buildPerformanceLeaderboard(cards.filter(card => roster.find(p => p.id === card.player_id)?.active)).ratings.find(r => r.playerId === id);
  const completed = matches.filter(match => match.complete);
  const form = completed.slice(0, 5).map(match => match.result === "win" ? "W" as const : match.result === "loss" ? "L" as const : "D" as const);
  const back = `/stats?view=players&season=${encodeURIComponent(seasonContext)}`;
  const profileUrl = `/stats/players/${id}?view=${view}&season=${encodeURIComponent(seasonContext)}`;
  const metrics = [
    ["3-dart average", stats?.three_dart_avg?.toFixed(1) ?? "–"], ["Legs won / played", `${stats?.legs_won ?? 0} / ${stats?.legs_played ?? 0}`],
    ["Checkout visit success", stats?.checkout_pct == null ? "–" : `${stats.checkout_pct.toFixed(0)}%`],
    ["Leg win rate", stats?.legs_played ? `${Math.round(100 * stats.legs_won / stats.legs_played)}%` : "–"], ["Leg difference", stats ? `${stats.legs_won - (stats.legs_played - stats.legs_won) > 0 ? "+" : ""}${stats.legs_won - (stats.legs_played - stats.legs_won)}` : "–"], ["Recorded visits", stats?.scoring_visits ?? 0],
    ["First 9 average", stats?.first_nine_avg?.toFixed(1) ?? "–"], ["High finish", stats?.high_finish ?? "–"],
    ["Darts per won leg", stats?.darts_per_leg_won?.toFixed(1) ?? "–"], ["180s", stats?.one_eighty ?? 0], ["26s", stats?.twenty_six ?? 0],
    ["60+ visits", stats?.sixty_plus ?? 0], ["100+ visits", stats?.hundred_plus ?? 0], ["140+ visits", stats?.hundred_forty_plus ?? 0],
  ];
  return <main className="flex flex-col gap-4">
    <Link className="text-sm font-semibold text-emerald-800 underline" href={back}>← Players</Link>
    <header className="flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><p className="text-sm text-slate-600">Player profile{!player.active ? " · Inactive" : ""}</p><h1 className="break-words text-2xl font-bold">{player.name}</h1></div>
      <StatsSeasonFilter seasons={seasons} selected={seasonContext} view={view} playerId={id} />
    </header>
    <section className="card"><p className="mb-2 text-sm text-slate-600">Recent match form · {season?.name ?? "All seasons"}</p><FormPills form={form} /><p className="mt-2 text-sm text-slate-600">{completed.length} completed matches · {stats?.legs_played ?? 0} completed legs</p></section>
    <nav className="flex flex-wrap gap-2" aria-label="Player profile views">
      {["overview", "matches", "practice"].map(tab => <Link key={tab} href={`/stats/players/${id}?view=${tab}&season=${encodeURIComponent(seasonContext)}`} aria-current={view === tab ? "page" : undefined} className={view === tab ? "btn-primary" : "btn-secondary"}>{tab[0].toUpperCase() + tab.slice(1)}</Link>)}
    </nav>
    {view === "overview" ? <>
      <section className="card"><h2 className="text-lg font-semibold mb-3">Season overview</h2><dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">{metrics.map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-sm text-slate-600">{label}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{value}</dd></div>)}</dl>{!stats && <p className="mt-3 text-sm text-slate-600">No completed league legs recorded in this season.</p>}</section>
      {rating && <details className="card"><summary className="font-semibold cursor-pointer">Performance score breakdown · {rating.score?.toFixed(1) ?? "–"} / 100</summary>
        <p className="mt-3 text-sm text-slate-600">{rating.qualified ? `Qualified · Rank ${rating.rank}` : `Provisional · ${rating.reasons.join("; ")}`}</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm text-left"><caption className="sr-only">Performance score evidence</caption><thead><tr>{["Measure", "Raw", "Sample", "Baseline", "Adjusted", "Percentile", "Points", "Weight", "Player evidence"].map(label => <th key={label} scope="col" className="p-2">{label}</th>)}</tr></thead><tbody>{rating.components.map(c => <tr key={c.id} className="border-t border-slate-200"><th scope="row" className="p-2">{c.label}</th><td className="p-2">{c.raw?.toFixed(1) ?? "–"}</td><td className="p-2">{c.sample} {c.unit}</td><td className="p-2">{c.baseline?.toFixed(1) ?? "–"}</td><td className="p-2">{c.adjusted?.toFixed(1) ?? "–"}</td><td className="p-2">{c.percentile.toFixed(1)}</td><td className="p-2">{c.contribution.toFixed(1)}</td><td className="p-2">{c.weight}%</td><td className="p-2">{Math.round(c.dataWeight * 100)}%</td></tr>)}</tbody></table></div>
        <Link className="mt-3 inline-block text-sm text-emerald-800 underline" href={back}>See ranking explanation</Link>
      </details>}
      <PerformanceCharts charts={[{ title: "Recent leg averages", subtitle: "Most recent 12 completed legs, oldest first", data: log.slice(0, 12).reverse().filter(g => g.three_dart_avg !== null).map((g, i) => ({ label: `${i + 1}: ${dateLabel(g.date)}`, value: Number(g.three_dart_avg!.toFixed(1)) })) }]} />
      <section className="card"><h2 className="font-semibold">Practice next</h2><p className="mt-1 text-sm text-slate-600">{stats?.checkout_pct != null && stats.checkout_pct < 30 ? "Build confidence on your finishing visits with Doubles Switch." : "Practice your scoring and finishing with a focused drill."}</p><Link className="btn-secondary mt-3" href={stats?.checkout_pct != null && stats.checkout_pct < 30 ? "/practice/doubles" : "/practice"}>Choose practice</Link></section>
      <details className="card"><summary className="cursor-pointer font-semibold">Equipment and player details</summary><dl className="mt-3 space-y-2 text-sm"><div><dt className="text-slate-600">Darts</dt><dd>{player.dart_model || "Not recorded"}</dd></div><div><dt className="text-slate-600">Stem length</dt><dd>{player.stem_length || "Not recorded"}</dd></div><div><dt className="text-slate-600">Flights</dt><dd>{player.flight_type || "Not recorded"}</dd></div></dl><Link href={`/players/${id}`} className="mt-3 inline-block text-sm text-emerald-800 underline">Manage player</Link></details>
    </> : view === "matches" ? <section className="card"><h2 className="mb-3 text-lg font-semibold">Match history</h2><div className="divide-y divide-slate-200">{matches.map(match => {
      const first = match.games[0];
      const href = match.complete ? `/matches/${first.id}?season=${encodeURIComponent(seasonContext)}&returnTo=${encodeURIComponent(profileUrl)}` : `/fixtures/${first.fixture_id}?season=${encodeURIComponent(season?.name ?? "all")}`;
      return <Link key={match.key} href={href} className="flex min-h-16 justify-between items-center gap-3 py-3"><div className="min-w-0"><p className="break-words font-semibold">vs {first.opponent_player || "Opponent"}</p><p className="text-sm text-slate-600">{first.fixtures.opponent} · {dateLabel(first.fixtures.starts_at)}</p></div><span className="shrink-0 text-right font-semibold">{match.complete ? `${match.result === "win" ? "Win" : match.result === "loss" ? "Loss" : "Draw"} ${match.westWins}–${match.oppWins}` : "In progress"}<span className="ml-2" aria-hidden="true">→</span></span></Link>;
    })}{!matches.length && <p className="text-sm text-slate-600">No matches recorded in this season.</p>}</div>
      {!!log.length && <details className="mt-4 rounded-lg border border-slate-200 p-3"><summary className="cursor-pointer font-semibold">Leg-by-leg statistics</summary><div className="mt-3 divide-y divide-slate-200">{log.map(leg => <Link key={leg.game_id} href={`/matches/${leg.game_id}?season=${encodeURIComponent(seasonContext)}&returnTo=${encodeURIComponent(profileUrl)}`} className="block py-3"><p className="font-semibold">{leg.won ? "Won" : "Lost"} leg vs {leg.opponent}</p><p className="text-sm text-slate-600">{dateLabel(leg.date)} · 3DA {leg.three_dart_avg?.toFixed(1) ?? "–"} · First 9 {leg.first_nine_avg?.toFixed(1) ?? "–"} · {leg.darts_thrown ?? "–"} darts · Finish {leg.high_finish ?? "–"}</p><p className="text-sm text-slate-600">100+ {leg.hundred_plus} · 140+ {leg.hundred_forty_plus} · 180s {leg.one_eighty} · 26s {leg.twenty_six}</p></Link>)}</div></details>}
    </section> : <section className="card"><h2 className="text-lg font-semibold">Practice history</h2><p className="mt-1 text-sm text-slate-600">All dates. Practice is separate from league seasons; Killer is saved only on its device.</p><div className="mt-3 divide-y divide-slate-200">{practice.map(session => <Link key={`${session.mode}-${session.id}`} href={session.href} className="flex min-h-16 items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-semibold">{session.mode}</p><p className="text-sm text-slate-600">{session.detail} · {dateLabel(session.date)}</p></div><span className="shrink-0 text-sm font-semibold">{session.status === "in_progress" ? "Resume" : "Results"} →</span></Link>)}{!practice.length && <p className="text-sm text-slate-600">No saved practice sessions for this player.</p>}</div><Link href="/practice" className="btn-secondary mt-3">Start practice</Link></section>}
  </main>;
}
