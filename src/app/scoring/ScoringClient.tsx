"use client";
import { useScoreTask } from "@/lib/useScoreTask";
import { ScoreSaveStatus } from "@/components/ScoreSaveStatus";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { clearPendingVisit, readPendingVisit, savePendingVisit } from "@/lib/pendingVisit";

export const dynamic = "force-dynamic";
export const revalidate = false;

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { finishRoutes } from "@/lib/finishRoutes";
import { canFinishFrom } from "@/lib/scoringUtils";
import { getLegCelebration, type LegCelebration } from "@/lib/scoringCelebration";
import { PeaCelebration } from "@/components/PeaCelebration";
import { LogCelebration } from "@/components/LogCelebration";
import {
  loadGameStateAction,
  recordVisitAction,
  undoLastVisitAction,
  newLegAction,
  getLegSummariesAction,
  LegSummaryWire
} from "./actions";
import type { LeagueGameMeta, LeagueState } from "@/lib/scoreTypes";
import { CheckoutDartsPrompt, MatchSummaryPanel, ScoreKeypad, type LegSummary } from "./parts";

type Visit = {
  score: number;
  darts: number;
  remainingAfter: number;
  isBust: boolean;
  isCheckout: boolean;
};

const START_SCORE = 501;
const SCORING_VIEW_KEY = "wgd-scoring-view";

const isValidCheckoutLocal = (remaining: number, score: number) =>
  remaining - score === 0 && canFinishFrom(remaining);


export default function ScoringPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fixtureId = searchParams.get("fixture");
  const gameId = searchParams.get("game");

  const [celebration, setCelebration] = useState<{ kind: LegCelebration; sequence: number } | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const { pending: saving, run: startTransition, error: saveError, saved, retry: retrySave, clearError: clearSaveError } = useScoreTask();
  const [loading, setLoading] = useState(true);
  const pending = saving || loading;
  const [alert, setAlert] = useState<string | null>(null);
  const [recovered, setRecovered] = useState<string | null>(null);
  const [gameMeta, setGameMeta] = useState<LeagueGameMeta | null>(null);
  const inputLocked = pending || saveError !== null || !gameMeta;
  const [activeSide, setActiveSide] = useState<"west" | "opponent">("west");
  const [inputScore, setInputScore] = useState("");
  const [oppRemaining, setOppRemaining] = useState(START_SCORE);
  const [wgdLegs, setWgdLegs] = useState(0);
  const [oppLegs, setOppLegs] = useState(0);
  const [finishPrompt, setFinishPrompt] = useState<{ score: number; side: "west" | "opponent" } | null>(null);
  const [legSummaries, setLegSummaries] = useState<LegSummary[]>([]);
  const [matchComplete, setMatchComplete] = useState(false);
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

  const mapVisits = (res: LeagueState): Visit[] => res.visits.map((v) => ({score: v.score, darts: v.darts, remainingAfter: v.remaining_after, isBust: v.is_bust, isCheckout: v.is_checkout}));
  const applyState = (res: LeagueState) => {
    setVisits(mapVisits(res));
    setGameMeta(res.meta);
    setOppRemaining(res.meta?.opponentRemaining ?? 501);
    setActiveSide(res.meta?.activeSide ?? "west");
    setWgdLegs(res.meta?.legs?.west ?? 0);
    setOppLegs(res.meta?.legs?.opp ?? 0);
    setMatchComplete((res.meta?.legs?.west ?? 0) + (res.meta?.legs?.opp ?? 0) >= 2);
  };
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      let res = await loadGameStateAction(gameId);
      if (cancelled) return;
      if (!res.ok || !res.meta) { setAlert("Could not load this game"); return; }
      // A visit sent just before a reload may never have been confirmed. Send it
      // again with its original request ID: the server records it at most once.
      const unconfirmed = readPendingVisit(gameId);
      if (unconfirmed) {
        const replay = await recordVisitAction(gameId, unconfirmed.score, unconfirmed.darts,
          unconfirmed.side === "west" ? "west_green" : "opponent", unconfirmed.revision, unconfirmed.requestId);
        clearPendingVisit();
        if (cancelled) return;
        if (replay.ok) {
          const fresh = await loadGameStateAction(gameId);
          if (cancelled) return;
          if (fresh.ok && fresh.meta) res = fresh;
          setRecovered(`The ${unconfirmed.score} entered before the page reloaded has been saved.`);
        } else {
          setAlert(`The ${unconfirmed.score} entered before the page reloaded was not saved: ${replay.message}`);
        }
      }
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
      const summaries = res.summaries ? { ok: true, summaries: res.summaries } : await getLegSummariesAction(gameId);
      if (summaries.ok) setLegSummaries(summaries.summaries.map((l: LegSummaryWire) => ({...l, threeDA: l.dartsTotal ? l.pointsTotal / l.dartsTotal * 3 : null})));
    })().catch(() => { if (!cancelled) setAlert("Could not load the score. Reload and try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gameId]);

  // "oche" is the big-score layout for a tablet propped up at the oche;
  // "standard" is the original phone layout. Remembered per device.
  const [viewMode, setViewMode] = useState<"standard" | "oche">("standard");
  const ocheView = viewMode === "oche";
  useEffect(() => {
    try {
      if (window.localStorage.getItem(SCORING_VIEW_KEY) === "oche") setViewMode("oche");
    } catch {}
  }, []);
  const toggleView = () => {
    setViewMode((current) => {
      const next = current === "oche" ? "standard" : "oche";
      try { window.localStorage.setItem(SCORING_VIEW_KEY, next); } catch {}
      return next;
    });
  };

  const finishHint = useMemo(() => {
    if (remaining <= 1 || remaining > 170) return null;
    return finishRoutes[remaining];
  }, [remaining]);

  const appendDigit = (d: number) => {
    if (inputLocked) return;
    const next = (inputScore + d.toString()).replace(/^0+/, "");
    setInputScore(next.slice(0, 3));
  };

  const submitVisit = async (score: number, side: "west" | "opponent", darts: number, requestId: string) => {
    if (!gameId || !gameMeta) return;
    // Kept until the server answers, so a reload during an outage can resend it.
    savePendingVisit({ gameId, score, side, darts, revision: gameMeta.revision, requestId });
    const res = await recordVisitAction(gameId, score, darts, side === "west" ? "west_green" : "opponent", gameMeta.revision, requestId);
    clearPendingVisit();
    setRecovered(null);
    if (!res.ok) throw new Error(res.message || "Could not save the score.");
    applyState(res);
    setInputScore(""); setFinishPrompt(null); setAlert(null);
    const kind = getLegCelebration(res.meta?.status, res.meta?.winner ?? undefined, mapVisits(res));
    if (kind) {
      setCelebration((previous) => ({ kind, sequence: (previous?.sequence ?? 0) + 1 }));
    }
    if (res.meta?.status === "completed") {
      const summaries = res.summaries ? { ok: true, summaries: res.summaries } : await getLegSummariesAction(gameId);
      if (summaries.ok) setLegSummaries(summaries.summaries.map((l: LegSummaryWire) => ({...l, threeDA: l.dartsTotal ? l.pointsTotal / l.dartsTotal * 3 : null})));
      if ((res.meta.legs?.west ?? 0) + (res.meta.legs?.opp ?? 0) < 2) {
        const next = await newLegAction(gameId);
        if (!next.ok) { setAlert(next.message || "Could not start the next leg. Reload to retry."); return; }
        router.replace(`/scoring?game=${next.gameId}${fixtureId ? `&fixture=${fixtureId}` : ""}&home=${isHome ? "1" : "0"}`);
      }
    }
  };
  const addScore = (score: number) => {
    if (inputLocked || !gameMeta || isCompleted || !Number.isInteger(score) || score < 0 || score > 180) return;
    const currentRemaining = activeSide === "west" ? remaining : oppRemaining;
    if (isValidCheckoutLocal(currentRemaining, score)) {
      setFinishPrompt({score, side: activeSide}); return;
    }
    const requestId = crypto.randomUUID();
    startTransition(() => submitVisit(score, activeSide, 3, requestId));
  };
  const undo = () => {
    if (!gameId || !gameMeta || inputLocked) return;
    const requestId = crypto.randomUUID();
    startTransition(async () => {
      const res = await undoLastVisitAction(gameId, gameMeta.revision, requestId);
      if (!res.ok) throw new Error(res.message || "Could not update the score.");
      applyState(res); setAlert(null);
      const summaries = res.summaries ? { ok: true, summaries: res.summaries } : await getLegSummariesAction(gameId);
      if (summaries.ok) setLegSummaries(summaries.summaries.map((l: LegSummaryWire) => ({...l, threeDA: l.dartsTotal ? l.pointsTotal / l.dartsTotal * 3 : null})));
    });
  };

  const reloadLatest = () => {
    if (!gameId || pending) return;
    startTransition(async () => {
      const res = await loadGameStateAction(gameId);
      if (!res.ok) throw new Error(res.message || "Could not reload the score.");
      if (!res.meta) throw new Error("Could not reload the score.");
      applyState(res); clearSaveError(); setAlert(null);
      if (res.meta.status === "completed" && (res.meta.legs?.west ?? 0) + (res.meta.legs?.opp ?? 0) < 2) {
        const next = res.meta.nextGameId ? { ok: true as const, gameId: res.meta.nextGameId } : await newLegAction(gameId);
        if (!next.ok) throw new Error(next.message || "Could not start the next leg.");
        router.replace(`/scoring?game=${next.gameId}${fixtureId ? `&fixture=${fixtureId}` : ""}&home=${isHome ? "1" : "0"}`);
      }
    });
  };

  const legDots = (won: number) => (
    <span className={`flex items-center justify-center ${ocheView ? "oche-dots gap-2.5" : "gap-1.5"}`} aria-label={`${won} legs won`}>
      {[0, 1].map((i) => (
        <span key={i} className={`leg-dot ${i < won ? "won" : ""}`} />
      ))}
    </span>
  );

  const keyClass = ocheView ? "oche-key" : "";

  const scorePanel = (side: "west" | "opponent") => {
    const isWest = side === "west";
    const value = isWest ? displayRemaining : displayOppRemaining;
    const throwing = activeSide === side && !isCompleted;
    return (
      <button
        type="button"
        className={`score-panel ${ocheView ? "oche-panel" : ""} ${throwing ? "active" : ""}`}
        onClick={() => setActiveSide(side)}
        disabled={inputLocked || finishPrompt !== null || isCompleted}
      >
        <p className={`truncate font-semibold text-slate-700 ${ocheView ? "oche-name" : "text-sm"}`}>{isWest ? wgdName : oppName}</p>
        <p
          key={`${isWest ? "w" : "o"}-${value}`}
          className={`score-remaining score-pop mt-1 ${ocheView ? "oche-remaining" : "text-6xl"} ${isWest ? "text-emerald-700" : "text-slate-800"}`}
        >
          {value}
        </p>
        <div className="mt-2">{legDots(isWest ? displayLegs.wgd : displayLegs.opp)}</div>
        <p className={`mt-1 font-bold uppercase tracking-widest ${ocheView ? "oche-throwing" : "text-[10px]"} ${throwing ? "text-emerald-700" : "text-transparent"}`}>
          ● Throwing
        </p>
      </button>
    );
  };

  const finishBanner = finishHint && !isCompleted && (
    <div className={`finish-banner ${ocheView ? "oche-finish" : ""}`}>
      <span aria-hidden="true">🎯</span>
      <span>
        {remaining} out: <span className="tracking-wide">{finishHint}</span>
      </span>
    </div>
  );

  const statusBlock = (
    <>
      {alert && <div role="alert" className="text-sm text-red-800"><p>{alert}</p><button className="btn-secondary mt-2" disabled={pending} onClick={reloadLatest}>Reload latest score</button></div>}
      <ConnectionBanner />
      {recovered && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{recovered}</p>}
      <ScoreSaveStatus pending={saving} saved={saved} error={saveError} retry={retrySave} reload={reloadLatest} />
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

    </>
  );

  const inputSection = !isCompleted && (
      <section className="card flex flex-col gap-3 !p-3" id="summary">
        {!finishPrompt && (
          <>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {activeSide === "west" ? wgdName : oppName} scored
              </span>
              <span className={`score-remaining text-slate-900 ${ocheView ? "oche-entry" : "text-4xl"}`}>{inputScore || "0"}</span>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[26, 45, 60, 85, 100, 140].map((q) => (
                <button
                  key={q}
                  type="button"
                  className={`chip border border-slate-300 bg-slate-100 px-3.5 py-1.5 text-slate-700 ${ocheView ? "oche-quick" : "text-sm"} transition hover:border-emerald-300 active:scale-95`}
                  onClick={() => addScore(q)}
                  disabled={inputLocked}
                >
                  {q}
                </button>
              ))}
            </div>

            <ScoreKeypad
              keyClass={keyClass}
              disabled={inputLocked}
              onDigit={appendDigit}
              onDelete={() => setInputScore((value) => value.slice(0, -1))}
              onEnter={() => addScore(parseInt(inputScore || "0", 10))}
            />

            <button
              type="button"
              className="btn-secondary text-sm"
              onClick={undo}
              disabled={inputLocked}
            >
              ↩ Undo last score
            </button>
          </>
        )}

        {finishPrompt && (
          <CheckoutDartsPrompt
            score={finishPrompt.score}
            keyClass={keyClass}
            disabled={inputLocked}
            onDarts={(darts) => { const requestId = crypto.randomUUID(); startTransition(() => submitVisit(finishPrompt.score, finishPrompt.side, darts, requestId)); }}
            onCancel={() => setFinishPrompt(null)}
          />
        )}

      </section>
      
  );

  return (
    <main className={`flex flex-col gap-3 fade-up ${ocheView ? "oche-view" : ""}`}>
      {celebration?.kind === "peas" && <PeaCelebration key={celebration.sequence} />}
      {celebration?.kind === "log" && <LogCelebration key={celebration.sequence} />}
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="chip border border-slate-300 bg-slate-100 text-slate-700 hover:border-emerald-300"
            onClick={toggleView}
            aria-pressed={ocheView}
            title={ocheView ? "Switch back to the standard scoring view" : "Switch to the big-score oche view for tablets"}
          >
            {ocheView ? "Standard view" : "Oche view"}
          </button>
          <span
            className={`chip ${isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}
          >
            {isCompleted ? "Done" : "Live"}
          </span>
        </div>
      </header>

      {ocheView ? (
        <div className="oche-layout">
          <div className="oche-board">
            <section className="oche-panels">
              {scorePanel("west")}
              {scorePanel("opponent")}
            </section>
            {finishBanner}
          </div>
          <div className="oche-controls">
            {statusBlock}
            {inputSection}
          </div>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-2">
            {scorePanel("west")}
            {scorePanel("opponent")}
          </section>
          {finishBanner}
          {statusBlock}
          {inputSection}
        </>
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

        {isCompleted && <MatchSummaryPanel legs={legSummaries} westName={wgdName} opponentName={oppName} />}
      </section>
    </main>
  );
}
