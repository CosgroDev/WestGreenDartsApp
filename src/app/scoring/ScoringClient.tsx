"use client";
import { useAsyncTask } from "@/lib/useAsyncTask";

export const dynamic = "force-dynamic";
export const revalidate = false;

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { finishRoutes } from "@/lib/finishRoutes";
import { canFinishFrom } from "@/lib/scoringUtils";
import {
  loadGameStateAction,
  recordVisitAction,
  undoLastVisitAction,
  newLegAction,
  getLegSummariesAction,
  LegSummaryWire
} from "./actions";

type Visit = {
  score: number;
  darts: number;
  remainingAfter: number;
  isBust: boolean;
  isCheckout: boolean;
};

const START_SCORE = 501;

const isValidCheckoutLocal = (remaining: number, score: number) =>
  remaining - score === 0 && canFinishFrom(remaining);

type LegSummary = {
  winner: "west" | "opponent";
  dartsTotal: number;
  pointsTotal: number;
  threeDA: number | null;
  firstNine: number | null;
  firstNinePoints: number | null;
  firstNineDarts: number | null;
  buckets: Record<string, number>;
};

export default function ScoringPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fixtureId = searchParams.get("fixture");
  const gameId = searchParams.get("game");

  const [visits, setVisits] = useState<Visit[]>([]);
  const [saving, startTransition] = useAsyncTask();
  const [loading, setLoading] = useState(true);
  const pending = saving || loading;
  const [alert, setAlert] = useState<string | null>(null);
  const [gameMeta, setGameMeta] = useState<any>(null);
  const [activeSide, setActiveSide] = useState<"west" | "opponent">("west");
  const [inputScore, setInputScore] = useState("");
  const [oppRemaining, setOppRemaining] = useState(START_SCORE);
  const [wgdLegs, setWgdLegs] = useState(0);
  const [oppLegs, setOppLegs] = useState(0);
  const [finishPrompt, setFinishPrompt] = useState<{ score: number; side: "west" | "opponent" } | null>(null);
  const [legSummaries, setLegSummaries] = useState<LegSummary[]>([]);
  const [matchComplete, setMatchComplete] = useState(false);
  const [throwLog, setThrowLog] = useState<("west" | "opponent")[]>([]);
  const remaining = visits.length ? visits[visits.length - 1].remainingAfter : START_SCORE;
  const wgdName = gameMeta?.players?.name ?? "West Green";
  const oppName = gameMeta?.opponent_player ?? "Opponent";
  const isHome = searchParams.get("home") === "1";
  const isCompleted = matchComplete || gameMeta?.status === "completed";
  const displayLegs = (() => {
    if (gameMeta?.legs) {
      return { wgd: gameMeta.legs.west ?? 0, opp: gameMeta.legs.opp ?? 0 };
    }
    if (gameMeta?.status === "completed") {
      if (gameMeta.winner === "west_green") return { wgd: 2, opp: 0 };
      if (gameMeta.winner === "opponent") return { wgd: 0, opp: 2 };
      return { wgd: 1, opp: 1 };
    }
    return { wgd: wgdLegs, opp: oppLegs };
  })();
  const displayRemaining = remaining;
  const displayOppRemaining = oppRemaining;

  const mapVisits = (res: any): Visit[] => res.visits.map((v: any) => ({score: v.score, darts: v.darts, remainingAfter: v.remaining_after, isBust: v.is_bust, isCheckout: v.is_checkout}));
  const applyState = (res: any) => {
    setVisits(mapVisits(res));
    setGameMeta(res.meta);
    setOppRemaining(res.meta?.opponentRemaining ?? 501);
    setActiveSide(res.meta?.activeSide ?? "west");
    setThrowLog(res.meta?.throwLog ?? []);
    setWgdLegs(res.meta?.legs?.west ?? 0);
    setOppLegs(res.meta?.legs?.opp ?? 0);
    setMatchComplete((res.meta?.legs?.west ?? 0) + (res.meta?.legs?.opp ?? 0) >= 2);
  };
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await loadGameStateAction(gameId);
      if (cancelled) return;
      if (!res.ok || !res.meta) { setAlert("Could not load this game"); return; }
      applyState(res);
      const west = res.meta.legs?.west ?? 0;
      const opp = res.meta.legs?.opp ?? 0;
      setWgdLegs(west); setOppLegs(opp);
      setMatchComplete(west + opp >= 2);
      if (res.meta.status === "completed" && west + opp < 2) {
        const next = await newLegAction(gameId);
        if (!next.ok) { setAlert(next.message); return; }
        router.replace(`/scoring?game=${next.gameId}${fixtureId ? `&fixture=${fixtureId}` : ""}&home=${isHome ? "1" : "0"}`);
      }
      const summaries = await getLegSummariesAction(gameId);
      if (summaries.ok) setLegSummaries(summaries.summaries.map((l: LegSummaryWire) => ({...l, threeDA: l.dartsTotal ? l.pointsTotal / l.dartsTotal * 3 : null})));
    })().catch(() => { if (!cancelled) setAlert("Could not load the score. Reload and try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gameId]);

  const finishHint = useMemo(() => {
    if (remaining <= 1 || remaining > 170) return null;
    return finishRoutes[remaining];
  }, [remaining]);

  const appendDigit = (d: number) => {
    const next = (inputScore + d.toString()).replace(/^0+/, "");
    setInputScore(next.slice(0, 3));
  };

  const submitVisit = async (score: number, side: "west" | "opponent", darts = 3) => {
    if (!gameId || !gameMeta) return;
    const res = await recordVisitAction(gameId, score, darts, side === "west" ? "west_green" : "opponent", gameMeta.revision, crypto.randomUUID());
    if (!res.ok) { setAlert(res.message); return; }
    applyState(res);
    setInputScore(""); setFinishPrompt(null); setAlert(null);
    if (res.meta?.status === "completed") {
      const summaries = await getLegSummariesAction(gameId);
      if (summaries.ok) setLegSummaries(summaries.summaries.map((l: LegSummaryWire) => ({...l, threeDA: l.dartsTotal ? l.pointsTotal / l.dartsTotal * 3 : null})));
      if ((res.meta.legs?.west ?? 0) + (res.meta.legs?.opp ?? 0) < 2) {
        const next = await newLegAction(gameId);
        if (!next.ok) { setAlert(next.message || "Could not start the next leg. Reload to retry."); return; }
        router.replace(`/scoring?game=${next.gameId}${fixtureId ? `&fixture=${fixtureId}` : ""}&home=${isHome ? "1" : "0"}`);
      }
    }
  };
  const addScore = (score: number) => {
    if (pending || !gameMeta || isCompleted || !Number.isInteger(score) || score < 0 || score > 180) return;
    const currentRemaining = activeSide === "west" ? remaining : oppRemaining;
    if (isValidCheckoutLocal(currentRemaining, score)) {
      setFinishPrompt({score, side: activeSide}); return;
    }
    startTransition(() => submitVisit(score, activeSide));
  };
  const undo = () => {
    if (!gameId || !gameMeta || pending) return;
    startTransition(async () => {
      const res = await undoLastVisitAction(gameId, gameMeta.revision);
      if (!res.ok) { setAlert(res.message); return; }
      applyState(res); setAlert(null);
      const summaries = await getLegSummariesAction(gameId);
      if (summaries.ok) setLegSummaries(summaries.summaries.map((l: LegSummaryWire) => ({...l, threeDA: l.dartsTotal ? l.pointsTotal / l.dartsTotal * 3 : null})));
    });
  };

  const legDots = (won: number) => (
    <span className="flex items-center justify-center gap-1.5" aria-label={`${won} legs won`}>
      {[0, 1].map((i) => (
        <span key={i} className={`leg-dot ${i < won ? "won" : ""}`} />
      ))}
    </span>
  );

  return (
    <main className="flex flex-col gap-3 fade-up">
      <header className="flex items-center justify-between gap-2">
        <a
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
          href={fixtureId ? `/fixtures/${fixtureId}` : "/fixtures"}
          aria-label="Back to fixture"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </a>
        <div className="text-center">
          <h1 className="text-lg font-bold leading-tight">501 Double-Out</h1>
          <p className="text-xs text-slate-500">Best of 2 legs</p>
        </div>
        <span
          className={`chip ${isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
        >
          {isCompleted ? "Done" : "Live"}
        </span>
      </header>

      <section className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={`score-panel ${activeSide === "west" && !isCompleted ? "active" : ""}`}
          onClick={() => setActiveSide("west")}
          disabled={finishPrompt !== null || isCompleted}
        >
          <p className="truncate text-sm font-semibold text-slate-700">{wgdName}</p>
          <p key={`w-${displayRemaining}`} className="score-remaining score-pop mt-1 text-6xl text-emerald-700">
            {displayRemaining}
          </p>
          <div className="mt-2">{legDots(displayLegs.wgd)}</div>
          <p className={`mt-1 text-[10px] font-bold uppercase tracking-widest ${activeSide === "west" && !isCompleted ? "text-emerald-700" : "text-transparent"}`}>
            ● Throwing
          </p>
        </button>
        <button
          type="button"
          className={`score-panel ${activeSide === "opponent" && !isCompleted ? "active" : ""}`}
          onClick={() => setActiveSide("opponent")}
          disabled={finishPrompt !== null || isCompleted}
        >
          <p className="truncate text-sm font-semibold text-slate-700">{oppName}</p>
          <p key={`o-${displayOppRemaining}`} className="score-remaining score-pop mt-1 text-6xl text-slate-800">
            {displayOppRemaining}
          </p>
          <div className="mt-2">{legDots(displayLegs.opp)}</div>
          <p className={`mt-1 text-[10px] font-bold uppercase tracking-widest ${activeSide === "opponent" && !isCompleted ? "text-emerald-700" : "text-transparent"}`}>
            ● Throwing
          </p>
        </button>
      </section>

      {finishHint && !isCompleted && (
        <div className="finish-banner">
          <span aria-hidden="true">🎯</span>
          <span>
            {remaining} out: <span className="tracking-wide">{finishHint}</span>
          </span>
        </div>
      )}
      {alert && <p className="text-center text-sm font-semibold text-emerald-700">{alert}</p>}
      {isCompleted && (
        <div className="flex flex-col gap-2">
          {gameId && (
            <a className="btn-primary" href={`/matches/${gameId}`}>
              📊 View match summary &amp; insights
            </a>
          )}
          {fixtureId && (
            <a className="btn-secondary" href={`/fixtures/${fixtureId}`}>
              Back to fixture
            </a>
          )}
        </div>
      )}

      {!isCompleted && (
      <section className="card flex flex-col gap-3 !p-3" id="summary">
        {!finishPrompt && (
          <>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {activeSide === "west" ? wgdName : oppName} scored
              </span>
              <span className="score-remaining text-4xl text-slate-900">{inputScore || "0"}</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[26, 45, 60, 85, 100, 140].map((q) => (
                <button
                  key={q}
                  type="button"
                  className="chip border border-slate-300 bg-slate-100 px-3.5 py-1.5 text-sm text-slate-700 transition hover:border-emerald-300 active:scale-95"
                  onClick={() => addScore(q)}
                  disabled={pending}
                >
                  {q}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button key={n} type="button" className="keypad-key" onClick={() => appendDigit(n)}>
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="keypad-key text-xl text-slate-500"
                onClick={() => setInputScore((s) => s.slice(0, -1))}
                aria-label="Delete digit"
              >
                ⌫
              </button>
              <button type="button" className="keypad-key" onClick={() => appendDigit(0)}>
                0
              </button>
              <button
                type="button"
                className="keypad-key bg-emerald-600 text-xl text-white"
                style={{ borderColor: "rgba(18,184,134,0.6)" }}
                onClick={() => addScore(parseInt(inputScore || "0", 10))}
                disabled={pending}
                aria-label="Enter score"
              >
                ✓
              </button>
            </div>

            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={undo}
              disabled={pending}
            >
              ↩ Undo last score
            </button>
          </>
        )}

        {finishPrompt && (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="text-lg font-bold text-emerald-800">GAME SHOT! 🎉</p>
            <p className="text-sm font-semibold text-slate-700">How many darts on the checkout?</p>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="keypad-key !text-lg"
                  disabled={pending || !canFinishFrom(finishPrompt.score, d)}
                  onClick={() => startTransition(() => submitVisit(finishPrompt.score, finishPrompt.side, d))}
                >
                  {d} dart{d > 1 ? "s" : ""}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="text-sm font-semibold text-red-600 underline"
              onClick={() => setFinishPrompt(null)}
            >
              Cancel
            </button>
          </div>
        )}

      </section>
      )}

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Visits (West)</h2>
        {!visits.length && !isCompleted && <p className="text-sm text-slate-600">No visits yet.</p>}
        <div className="flex flex-col gap-2">
          {visits.map((v, idx) => {
            const cumDarts = visits.slice(0, idx + 1).reduce((s, x) => s + x.darts, 0);
            return (
              <div
                key={idx}
                className="flex justify-between items-center rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <div className="font-semibold">#{idx + 1}</div>
                <div className="flex gap-3 items-center">
                  <span className="text-slate-800">{v.score}</span>
                  <span className="text-slate-500">{cumDarts} darts</span>
                  {v.isBust && <span className="text-red-600">BUST</span>}
                  {v.isCheckout && <span className="text-emerald-700">Checkout</span>}
                  <span className="text-slate-500">Rem: {v.remainingAfter}</span>
                </div>
              </div>
            );
          })}
        </div>

        {isCompleted && (
          <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            <p className="font-semibold mb-2">Match summary (best of 2)</p>
            <div className="flex flex-col gap-2">
              {legSummaries.map((leg, i) => (
                <div key={i} className="rounded-md border border-slate-200 p-2 bg-white">
                  <p className="font-semibold">
                    Leg {i + 1}: {leg.winner === "west" ? wgdName : oppName}
                  </p>
                  <p>Total darts (West): {leg.dartsTotal}</p>
                  <p>3-dart average (West): {leg.threeDA !== null ? leg.threeDA.toFixed(1) : "-"}</p>
                  <p>First 9 darts avg (West): {leg.firstNine !== null ? leg.firstNine.toFixed(1) : "-"}</p>
                  <p>Opponent 3DA: not tracked</p>
                  <div className="mt-1 grid grid-cols-3 gap-1 text-xs text-slate-600">
                    {Object.entries(leg.buckets).map(([label, val]) => (
                      <span key={label}>
                        {label}: <strong>{val}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {legSummaries.length > 1 && (() => {
                const totalDarts = legSummaries.reduce((s, l) => s + l.dartsTotal, 0);
                const totalPoints = legSummaries.reduce((s, l) => s + l.pointsTotal, 0);
                const totalBuckets = legSummaries.reduce((acc, l) => {
                  Object.entries(l.buckets).forEach(([k, v]) => (acc[k] = (acc[k] || 0) + v));
                  return acc;
                }, {} as Record<string, number>);
                const total3da = totalDarts > 0 ? (totalPoints / totalDarts) * 3 : null;
                const totalFirst9Points = legSummaries.reduce((s, l) => s + (l.firstNinePoints ?? 0), 0);
                const totalFirst9Darts = legSummaries.reduce((s, l) => s + (l.firstNineDarts ?? 0), 0);
                const totalFirst9 = totalFirst9Darts > 0 ? (totalFirst9Points / totalFirst9Darts) * 3 : null;
                return (
                  <div className="rounded-md border border-slate-200 p-2">
                    <p className="font-semibold">Totals</p>
                    <p>Total darts (West): {totalDarts}</p>
                    <p>Average 3DA (West): {total3da ? total3da.toFixed(1) : "-"}</p>
                    <p>Average first 9 (West): {totalFirst9 ? totalFirst9.toFixed(1) : "-"}</p>
                    <p>Opponent 3DA: not tracked</p>
                    <div className="mt-1 grid grid-cols-3 gap-1 text-xs text-slate-600">
                      {Object.entries(totalBuckets).map(([label, val]) => (
                        <span key={label}>
                          {label}: <strong>{val}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
