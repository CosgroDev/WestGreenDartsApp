"use client";
import { useEffect, useState } from "react";
import { isLeagueRefreshWindow, LEAGUE_REFRESH_INTERVAL_MS, LEAGUE_REFRESH_DESCRIPTION } from "@/lib/leagueRefresh";
import type { LeagueInsights, InsightResult } from "@/lib/leagueInsights";
const pct = (value: number | null) => value === null ? "—" : (value * 100).toFixed(1) + "%";
const pp = (value: number | null) => value === null ? "—" : (value >= 0 ? "+" : "") + (value * 100).toFixed(1) + "pp";

export function InsightsView() {
  const [data, setData] = useState<LeagueInsights | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    let active = true, busy = false;
    let controller: AbortController | null = null;
    async function load(force = false) {
      if (busy) return;
      busy = true; controller = new AbortController();
      const timer = window.setTimeout(() => controller?.abort(), 20000);
      setLoading(true);
      try {
        const response = await fetch("/api/league-insights" + (force ? "?refresh=1" : ""), { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Unavailable");
        const result = await response.json() as LeagueInsights;
        if (!Array.isArray(result.teams) || !result.teams.some(t => t.teamId === result.targetId)) throw new Error("Invalid insights");
        if (active) { setData(result); setError(false); }
      } catch { if (active) setError(true); }
      finally { window.clearTimeout(timer); busy = false; if (active) setLoading(false); }
    }
    void load(refresh > 0);
    const interval = window.setInterval(() => { if (document.visibilityState === "visible" && isLeagueRefreshWindow()) void load(); }, LEAGUE_REFRESH_INTERVAL_MS);
    return () => { active = false; controller?.abort(); window.clearInterval(interval); };
  }, [refresh]);
  const target = data?.teams.find(t => t.teamId === data.targetId);
  const opponent = data?.opponents.find(t => t.teamId === selected) ?? data?.opponents[0];
  const stale = data && isLeagueRefreshWindow() && Date.now() - Date.parse(data.checkedAt) > 600000;
  return <>
    <section className="card">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-semibold">{data?.league ?? "Barnsley Townend Monday Night League 2"}</p>
          <p className="mt-1 text-xs text-slate-600">{data ? "Source checked " + new Date(data.checkedAt).toLocaleString("en-GB") : "Loading live results…"}</p></div>
        <button className="btn-secondary text-sm" disabled={loading} onClick={() => setRefresh(n => n + 1)}>{loading ? "Checking…" : "Refresh"}</button>
      </div>
      <p className="mt-2 text-xs text-slate-600">{LEAGUE_REFRESH_DESCRIPTION}</p>
      {(error || stale) && <p role="status" className="mt-3 text-sm text-amber-800">{data ? "Showing the last retrieved results. The source has not refreshed successfully yet." : "Live results are temporarily unavailable. Please try again."}</p>}
      <p className="mt-3 text-sm text-slate-600">League match scores. Form uses league week order; tournament games and byes are excluded. Other teams’ dart averages and checkouts are not supplied by this source.</p>
    </section>
    {data && target && <>
      <section className="grid grid-cols-2 gap-3" aria-label="West Green performance">
        {[
          ["League position", String(target.position) + " · " + target.points + " points"],
          ["Match record", target.wins + "W · " + target.draws + "D · " + target.losses + "L"],
          ["Legs won", pct(target.share)],
          ["Last " + target.recent.played + " matches", pct(target.recent.share)],
          ["At home", pct(target.home.share) + " · " + target.home.played + " played"],
          ["Away", pct(target.away.share) + " · " + target.away.played + " played"]
        ].map(([label, value]) => <div className="card" key={label}><p className="text-xs text-slate-600">{label}</p><p className="mt-2 text-lg font-bold text-emerald-800">{value}</p></div>)}
      </section>
      <section className="card" aria-labelledby="season-projection-title">
        <h2 id="season-projection-title" className="text-lg font-semibold">End-of-season projection</h2>
        {data.projection ? <>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-emerald-50 p-3 text-emerald-900"><p className="text-xs">Projected finish by expected points</p><p className="mt-1 text-2xl font-bold">{ordinal(data.projection.target.position)}</p></div>
            <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-600">Projected final points</p><p className="mt-1 text-2xl font-bold">{data.projection.target.points.toFixed(1)}</p></div>
          </div>
          <p className="mt-3 text-sm">West Green: {data.projection.target.remaining} games left · about <strong>{data.projection.target.additionalLegs.toFixed(1)} more legs won</strong> expected, on top of {target.points} current points.</p>
          {data.projection.positionRange && <p className="mt-2 text-sm text-slate-600">The middle 80% of simulated seasons finish between <strong>{ordinal(data.projection.positionRange.low)} and {ordinal(data.projection.positionRange.high)}</strong>, with {data.projection.pointsRange!.low}–{data.projection.pointsRange!.high} points. The most frequent simulated finish is {ordinal(data.projection.mostFrequentPosition!)}.</p>}
          {!data.coverageVerified && <p className="mt-3 text-sm text-amber-800">Conditional projection: the supplied fixtures do not form a complete home-and-away schedule. Missing or additional fixtures could change the final position.</p>}
          <p className="mt-2 text-xs text-slate-600">Projects all {data.remainingMatches} unplayed league games, including postponed or undated fixtures. Existing deductions and official tie-breaks are retained. Fractional points show expected values.</p>
          {data.projection.distribution.length > 0 && <div className="mt-4" aria-label="West Green simulated finishing positions">
            <h3 className="font-semibold">Simulated finishes</h3>
            <ul className="mt-2 space-y-2">{data.projection.distribution.map(r => <li key={r.position}>
              <div className="flex justify-between text-sm"><span>{ordinal(r.position)}</span><span>{(r.fraction * 100).toFixed(1)}% of scenarios</span></div>
              <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-emerald-500" style={{ width: (r.fraction * 100) + "%" }} /></div>
            </li>)}</ul>
          </div>}
          <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Projected final league table</summary>
            <div className="mt-2 overflow-x-auto"><table className="w-full text-sm" aria-label="Projected final league table">
              <thead className="text-slate-600"><tr>{["Finish / Team", "Now", "Left", "Extra legs", "Final pts"].map(h => <th key={h} scope="col" className="p-2 text-left">{h}</th>)}</tr></thead>
              <tbody>{data.projection.table.map(t => <tr key={t.teamId} className={t.teamId === data.targetId ? "bg-emerald-50 font-bold text-emerald-900" : "border-t border-slate-200"}>
                <th scope="row" className="p-2 text-left">{t.position}. {t.team}</th><td className="p-2">{t.currentPoints}</td><td className="p-2">{t.remaining}</td><td className="p-2">{t.additionalLegs.toFixed(1)}</td><td className="p-2">{t.points.toFixed(1)}</td>
              </tr>)}</tbody>
            </table></div>
          </details>
          <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer">How the season range is calculated</summary>
            <p className="mt-2">{data.projection.iterations} scenarios apply historical whole-match prediction errors to each remaining fixture, preserving its total legs. Errors come from {data.projection.residualSample} earlier-week forecast tests and are centred around the expected score. These are model scenarios, not calibrated guarantees; team strength is held fixed and errors are sampled independently across fixtures. Line-up changes and future deductions are unknown.</p>
          </details>
        </> : <p className="mt-3 text-sm text-slate-600">{data.projectionUnavailable}</p>}
      </section>
      <section className="card">
        <h2 className="text-lg font-semibold">How we compare</h2>
        <p className="mt-2 text-sm text-slate-600">Leg share accounts for games played. Adjusted strength estimates performance against an average opponent on neutral ground; positive is above average. It accounts for opponents and home advantage, with small samples pulled towards average.</p>
        <p className="mt-2 text-sm">West Green adjusted strength: <strong>{pp(data.adjustedStrength)}</strong>. Opposition faced: <strong>{pp(data.scheduleStrength)}</strong> relative to average.</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full text-sm">
          <caption className="sr-only">All league teams, in official table order</caption>
          <thead className="border-b border-slate-300 text-slate-600"><tr>{["Pos / Team", "P", "Points", "Leg %", "Strength", "Last 5"].map(h => <th key={h} className="p-2 text-left" scope="col">{h}</th>)}</tr></thead>
          <tbody>{data.teams.map(t => <tr key={t.teamId} className={t.teamId === data.targetId ? "bg-emerald-50 font-bold text-emerald-900" : "border-b border-slate-200"}>
            <th scope="row" className="p-2 text-left">{t.position}. {t.team}</th>
            <td className="p-2">{t.played}</td><td className="p-2">{t.points}</td><td className="p-2">{pct(t.share)}</td><td className="p-2 whitespace-nowrap">{t.played >= 5 ? pp(t.adjustedStrength) : "Too few games"}</td>
            <td className="p-2 whitespace-nowrap">{[...t.form].reverse().join(" ") || "—"}</td>
          </tr>)}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-slate-600">Form reads oldest → newest. Points retain official deductions; performance metrics use completed, valid score records.</p>
      </section>
      <section className="card" aria-labelledby="opponent-title">
        <h2 id="opponent-title" className="text-lg font-semibold">Head-to-head & common opponents</h2>
        <label htmlFor="insight-opponent" className="mt-3 block text-sm text-slate-600">Compare West Green with</label>
        <select id="insight-opponent" className="mt-2 w-full rounded-lg border border-slate-300 bg-slate-50 p-3 text-slate-800" value={opponent?.teamId ?? ""} onChange={e => setSelected(e.target.value)}>
          {data.opponents.map(o => <option key={o.teamId} value={o.teamId}>{o.team}</option>)}
        </select>
        <h3 className="mt-4 font-semibold">Meetings this season</h3>
        {opponent?.direct.length ? <ResultList results={opponent.direct} targetId={data.targetId} /> : <p className="mt-2 text-sm text-slate-600">No completed league meetings in the source.</p>}
        <h3 className="mt-4 font-semibold">Against the same opponents</h3>
        <p className="mt-1 text-xs text-slate-600">Legs won %, with games played. Venue, timing and line-ups can differ.</p>
        {opponent?.common.length ? <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="py-2 text-left" scope="col">Opponent</th><th className="p-2 text-right" scope="col">West Green</th><th className="p-2 text-right" scope="col">{opponent.team}</th></tr></thead>
          <tbody>{opponent.common.map(o => <tr key={o.team} className="border-t border-slate-200"><th className="py-3 text-left" scope="row">{o.team}</th><td className="p-2 text-right">{pct(o.target.share)} ({o.target.played})</td><td className="p-2 text-right">{pct(o.opponent.share)} ({o.opponent.played})</td></tr>)}</tbody>
        </table></div> : <p className="mt-2 text-sm text-slate-600">No shared opponents with completed results yet.</p>}
      </section>
      <section className="card" aria-labelledby="forecast-title">
        <h2 id="forecast-title" className="text-lg font-semibold">Remaining fixture legs analysis</h2>
        <p className="mt-2 text-sm text-slate-600">Estimates from completed league scores, allowing for opponent strength and venue. Each forecast shows West Green’s expected legs for and against, allowing you to see where the remaining points may come from. They are estimates rather than exact scores. At least five completed games per team are required.</p>
        {data.forecasts.length ? <ul className="mt-3 space-y-3">{data.forecasts.map(f => <li key={f.id} className="rounded-lg bg-slate-50 p-3">
          <p className="font-semibold">{f.week === null ? "Week unknown" : "Week " + f.week} · {f.opponent} · {f.home ? "Home" : "Away"}</p>
          <p className="mt-1 text-sm text-emerald-800">{f.share === null ? "Not enough results for an estimate" : f.expectedLegs === null ? pct(f.share) + " expected leg share" : "West Green " + f.expectedLegs.toFixed(1) + " – " + f.expectedAgainst!.toFixed(1) + " " + f.opponent + " expected legs"}</p>
          {f.expectedLegs !== null && <div className="mt-2 flex h-3 overflow-hidden rounded bg-slate-200" aria-label={"Expected leg share: West Green " + pct(f.share)}>
            <div className="bg-emerald-500" style={{ width: (f.share! * 100) + "%" }} /><div className="flex-1 bg-slate-400" />
          </div>}
          {f.band && <p className="mt-2 text-xs text-slate-600">Historical error band: roughly {f.band.low.toFixed(1)}–{f.band.high.toFixed(1)} West Green legs.</p>}
          {f.unresolved && <p className="mt-1 text-xs text-amber-800">Earlier unplayed or undated fixture · included in the season projection.</p>}
          <p className="mt-1 text-xs text-slate-600">Based on {target.played} West Green games and {f.sample} opponent games.</p>
        </li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No unplayed West Green fixtures available in the source.</p>}
        <h3 className="mt-4 font-semibold">How reliable is the estimate?</h3>
        <p className="mt-2 text-sm text-slate-600">{data.validation.matches ? "Tested on " + data.validation.matches + " past league matches, using only earlier weeks. Average score error: " + data.validation.meanAbsoluteLegError!.toFixed(2) + " legs; a simple league home-average estimate: " + data.validation.baselineLegError!.toFixed(2) + " legs." : "There are not enough earlier results to measure past accuracy yet."}</p>
        {data.validation.matches > 0 && data.validation.meanAbsoluteLegError! >= data.validation.baselineLegError! && <p className="mt-2 text-sm text-amber-800">The strength model has not beaten the simple baseline in this test. Treat the estimates cautiously.</p>}
        <details className="mt-3 text-sm text-slate-600"><summary className="cursor-pointer">Method and data coverage</summary>
          <p className="mt-2">The model fits each team’s leg share as 50% + home strength − away strength + home advantage. Ridge regularisation of 5 pulls sparse estimates towards average. Estimates are bounded to 5–95%. Deduction points affect the table, not playing strength. The accuracy test starts after 20 earlier fixtures; no results from the predicted week are used.</p>
          <p className="mt-2">The source supplies up to 500 fixtures across both leagues and 300 week records. {data.results.length} completed league scores analysed; {data.omittedResults} played records excluded for missing or invalid scores; {data.undatedResults} results without a week excluded from form and accuracy testing; {data.unresolvedFixtures} earlier unplayed fixtures included in the remaining-fixture analysis.</p>
          {(data.fixtureLimitReached || data.weekLimitReached) && <p className="mt-2 text-amber-800">A source record limit was reached. Coverage may be incomplete.</p>}
          <p className="mt-2">Weeks are schedule order, not proof of the actual playing date. Postponements can affect the accuracy test. Match scores do not identify individual player form or line-up changes.</p>
        </details>
      </section>
      <section className="card">
        <h2 className="text-lg font-semibold">Recent league results</h2>
        <ResultList results={data.results.slice(0, 20)} targetId={data.targetId} />
        <a href={data.source} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm text-emerald-800 underline">Open league source ↗</a>
      </section>
    </>}
  </>;
}
function ResultList({ results, targetId }: { results: InsightResult[]; targetId: string }) {
  return <ul className="mt-2 divide-y divide-slate-200">{results.map(r => <li key={r.id} className={"py-3 text-sm " + (r.homeId === targetId || r.awayId === targetId ? "font-semibold text-emerald-800" : "")}>
    <span className="text-xs text-slate-600">Week {r.week ?? "unknown"} · </span>{r.home} {r.homeScore}–{r.awayScore} {r.away}
  </li>)}</ul>;
}

function ordinal(position: number) {
  const remainder = position % 100;
  const suffix = remainder >= 11 && remainder <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[position % 10] ?? "th";
  return position + suffix;
}
