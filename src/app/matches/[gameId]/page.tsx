export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { getMatchSummary, getMatchAiReview } from "@/data/matchSummary";
import { analyseMatch } from "@/lib/matchInsights";
import { AiReview } from "./AiReview";
import { getGamesForFixture } from "@/data/games";
import { getSeasons } from "@/data/seasons";
import { summariseFixture } from "@/lib/fixtureState";
import { safeLocalDestination } from "@/lib/localDestination";

type Props = { params: Promise<{ gameId: string }>; searchParams: Promise<{ season?: string; returnTo?: string }> };

const visitTone = (score: number, isBust: boolean, isCheckout: boolean) => {
  if (isBust) return "bg-red-50 text-red-700 border-red-200";
  if (isCheckout) return "bg-amber-50 text-amber-700 border-amber-200";
  if (score === 180) return "bg-amber-50 text-amber-700 border-amber-200";
  if (score >= 100) return "bg-purple-50 text-purple-700 border-purple-200";
  if (score >= 60) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (score === 26) return "bg-slate-50 text-slate-500 border-slate-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
};

export default async function MatchSummaryPage({ params: paramsPromise, searchParams }: Props) {
  const [params, query] = await Promise.all([paramsPromise, searchParams]);
  const [match, aiReview] = await Promise.all([
    getMatchSummary(params.gameId),
    getMatchAiReview(params.gameId)
  ]);
  if (!match) return notFound();

  const [games, seasons] = await Promise.all([getGamesForFixture(match.fixtureId), getSeasons()]);
  const fixture = summariseFixture(games);
  const current = fixture.matches.find(group => group.games.some(game => game.id === params.gameId));
  const matchComplete = current?.complete === true;
  const next = fixture.matches.find(group => !group.complete && group !== current);
  const nextLeg = next?.games.find(game => game.status === "in_progress");
  const selectedSeason = seasons.find(season => season.id === query.season || season.name === query.season);
  const fixtureHref = `/fixtures/${match.fixtureId}${query.season ? `?season=${encodeURIComponent(selectedSeason?.name ?? query.season)}` : ""}`;
  const safeReturn = safeLocalDestination(query.returnTo, fixtureHref);
  const returnTo = /^\/(stats|fixtures|dashboard)(\/|\?|$)/.test(safeReturn) ? safeReturn : fixtureHref;
  const returnLabel = returnTo.startsWith("/stats/players/") ? "Back to player profile" : returnTo.startsWith("/stats") ? "Back to Stats" : "Back to fixture";
  const insights = analyseMatch(match);
  const resultTone =
    !matchComplete ? "border-slate-200 bg-slate-50 text-slate-700" : match.result === "win"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : match.result === "loss"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <main className="flex flex-col gap-4 fade-up">
      <header className="flex items-center gap-3">
        <Link
          href={returnTo}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
          aria-label={returnLabel}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Match summary</p>
          <h1 className="break-words text-xl font-bold">
            {match.westPlayerName} vs {match.opponentPlayer}
          </h1>
          <p className="text-sm text-slate-500">{match.fixtureLabel}</p>
        </div>
      </header>

      <Link href={returnTo} className="text-sm font-semibold text-emerald-800 underline">← {returnLabel.replace("Back to ", "")}</Link>
      <section className="card">
        <h2 className="font-semibold">{matchComplete ? "Match saved" : "Match in progress"}</h2>
        <p className="mt-1 text-sm text-slate-600">{fixture.completedMatches} of 6 matches complete{fixture.complete ? " · Fixture complete" : ""}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {!matchComplete && current?.games.find(game => game.status === "in_progress") ? <Link className="btn-primary" href={`/scoring?game=${current.games.find(game => game.status === "in_progress")!.id}&fixture=${match.fixtureId}`}>Resume scoring</Link> : null}
          {matchComplete && !fixture.complete ? <Link className="btn-primary" href={nextLeg ? `/scoring?game=${nextLeg.id}&fixture=${match.fixtureId}` : `${fixtureHref}#create-match`}>{nextLeg ? "Resume next match" : "Start next match"}</Link> : null}
          <Link className="btn-secondary" href={fixtureHref}>{fixture.complete ? "View fixture result" : "View lineup"}</Link>
        </div>
      </section>
      <section className={`card flex flex-wrap gap-3 items-center justify-between !py-4 ${!matchComplete ? "!border-slate-200" : resultTone.includes("emerald") ? "!border-emerald-200" : match.result === "loss" ? "!border-red-200" : "!border-amber-200"}`}>
        <div>
          <span className={`chip border ${resultTone}`}>
            {!matchComplete ? "In progress" : match.result === "win" ? "Win" : match.result === "loss" ? "Loss" : "Draw"}
          </span>
          <p className="mt-2 text-sm text-slate-600">{matchComplete ? insights.headline : "The result is provisional until both legs finish."}</p>
        </div>
        <p className="score-remaining text-5xl">
          {current?.westWins ?? match.westLegs}
          <span className="text-slate-500">-</span>
          {current?.oppWins ?? match.oppLegs}
        </p>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">The numbers</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div className="rounded-xl bg-slate-50 px-3 py-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">3DA</p>
            <p className="mt-1 text-xl font-bold">{match.threeDartAvg !== null ? match.threeDartAvg.toFixed(1) : "–"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">First 9</p>
            <p className="mt-1 text-xl font-bold">{match.firstNineAvg !== null ? match.firstNineAvg.toFixed(1) : "–"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Checkout</p>
            <p className="mt-1 text-xl font-bold">
              {match.checkoutAttempts > 0 ? `${match.checkoutHits}/${match.checkoutAttempts}` : "–"}
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">High finish</p>
            <p className="mt-1 text-xl font-bold text-amber-700">{match.highFinish ?? "–"}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Best leg</p>
            <p className="mt-1 text-xl font-bold">
              {match.bestLegDarts !== null ? `${match.bestLegDarts} darts` : "–"}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Busts</p>
            <p className={`mt-1 text-xl font-bold ${match.busts > 0 ? "text-red-600" : ""}`}>{match.busts}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {match.bands.oneEighty > 0 && (
            <span className="chip border border-amber-200 bg-amber-50 text-amber-700">{match.bands.oneEighty} × 180</span>
          )}
          {match.bands.oneFortyPlus > 0 && (
            <span className="chip border border-purple-200 bg-purple-50 text-purple-700">{match.bands.oneFortyPlus} × 140+</span>
          )}
          {match.bands.hundredPlus > 0 && (
            <span className="chip border border-emerald-200 bg-emerald-50 text-emerald-700">{match.bands.hundredPlus} × 100+</span>
          )}
          {match.bands.sixtyPlus > 0 && (
            <span className="chip border border-slate-200 bg-slate-50 text-slate-700">{match.bands.sixtyPlus} × 60+</span>
          )}
          {match.bands.twentySix > 0 && (
            <span className="chip border border-slate-200 bg-slate-50 text-slate-500">{match.bands.twentySix} × 26</span>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Leg by leg</h2>
        <div className="flex flex-col gap-3">
          {match.legs.map((leg, i) => (
            <div key={leg.gameId} className="rounded-2xl border border-slate-200 bg-slate-50/40 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  Leg {i + 1}{" "}
                  <span
                    className={`chip ml-1 border ${
                      leg.winner === "west"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : leg.winner === "opponent"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {leg.winner === "west" ? `${match.westPlayerName} won` : leg.winner === "opponent" ? `${match.opponentPlayer} won` : "Draw"}
                  </span>
                </p>
                <p className="text-sm text-slate-500">
                  {leg.dartsTotal} darts{leg.threeDartAvg !== null ? ` · ${leg.threeDartAvg.toFixed(1)} avg` : ""}
                </p>
              </div>
              {leg.visits.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {leg.visits.map((v, j) => (
                    <span
                      key={j}
                      className={`inline-flex items-center rounded-lg border px-2 py-1 text-sm font-semibold ${visitTone(v.score, v.isBust, v.isCheckout)}`}
                      title={v.isBust ? `Bust — stayed on ${v.remainingAfter}` : v.isCheckout ? `Checkout: ${v.score}` : `${v.remainingAfter} left`}
                    >
                      {v.score}
                      {v.isBust && <span className="ml-1 text-[10px]">✕</span>}
                      {v.isCheckout && <span className="ml-1 text-[10px]">🎯</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">No visit data recorded for this leg.</p>
              )}
            </div>
          ))}
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Visits shown for {match.westPlayerName} only — opponent visits aren&apos;t tracked. 🎯 checkout · ✕ bust
        </p>
      </section>

      {matchComplete && <>
      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Coach&apos;s verdict</h2>
        <div className="flex flex-col gap-3">
          {insights.strengths.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 mb-1">What went well</p>
              <ul className="flex flex-col gap-1.5">
                {insights.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-emerald-700" aria-hidden="true">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insights.workOns.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">Work-ons</p>
              <ul className="flex flex-col gap-1.5">
                {insights.workOns.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="text-amber-700" aria-hidden="true">▲</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {insights.practice.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-purple-700 mb-1">Practice this week</p>
              <div className="flex flex-col gap-2">
                {insights.practice.map((p) => (
                  <Link
                    key={p.title}
                    href={p.href}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-purple-200 bg-purple-50/40 px-4 py-2.5 transition hover:border-purple-300"
                  >
                    <div>
                      <p className="font-semibold text-purple-700">{p.title}</p>
                      <p className="text-xs text-slate-600">{p.reason}</p>
                    </div>
                    <span className="text-purple-700" aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="card !border-amber-200">
        <h2 className="text-lg font-semibold mb-2">✨ AI performance review</h2>
        <AiReview
          gameId={params.gameId}
          configured={Boolean(process.env.ANTHROPIC_API_KEY)}
          initialReview={aiReview.review}
        />
        {aiReview.reviewAt && (
          <p className="mt-3 text-sm text-slate-400">
            Saved {new Date(aiReview.reviewAt).toLocaleDateString()}
          </p>
        )}
      </section>
      </>}
    </main>
  );
}
