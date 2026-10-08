"use client";
import { useScoreTask } from "@/lib/useScoreTask";
import { ScoreSaveStatus } from "@/components/ScoreSaveStatus";
import "./scoring.css";

export const dynamic = "force-dynamic";
export const revalidate = false;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const mapVisits = (res: any): Visit[] => res.visits.map((v: any) => ({score: v.score, darts: v.darts, remainingAfter: v.remaining_after, isBust: v.is_bust, isCheckout: v.is_checkout}));

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

  const [celebration, setCelebration] = useState<{ kind: LegCelebration; sequence: number } | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const { pending: saving, run: startTransition, error: saveError, saved, retry: retrySave, clearError: clearSaveError } = useScoreTask();
  const [loading, setLoading] = useState(true);
  const pending = saving || loading;
  const [alert, setAlert] = useState<string | null>(null);
  const [gameMeta, setGameMeta] = useState<any>(null);
  const inputLocked = pending || saveError !== null || !gameMeta;
  const [activeSide, setActiveSide] = useState<"west" | "opponent">("west");
  const [inputScore, setInputScore] = useState("");
  const [oppRemaining, setOppRemaining] = useState(START_SCORE);
  const [wgdLegs, setWgdLegs] = useState(0);
  const [oppLegs, setOppLegs] = useState(0);
  const [finishPrompt, setFinishPrompt] = useState<{ score: number; side: "west" | "opponent" } | null>(null);
  const [legSummaries, setLegSummaries] = useState<LegSummary[]>([]);
  const [matchComplete, setMatchComplete] = useState(false);
  const [throwLog, setThrowLog] = useState<("west" | "opponent")[]>([]);
  const [savedMessage, setSavedMessage] = useState("Latest score loaded");
  const [confirmUndo, setConfirmUndo] = useState(false);
  const undoTriggerRef = useRef<HTMLButtonElement>(null);
  const undoConfirmRef = useRef<HTMLButtonElement>(null);
  const reopenedSide = useRef<{ gameId: string; side: "west" | "opponent" } | null>(null);
  useEffect(() => { if (confirmUndo) undoConfirmRef.current?.focus(); }, [confirmUndo]);
  const remaining = visits.length ? visits[visits.length - 1].remainingAfter : START_SCORE;
  const wgdName = gameMeta?.players?.name ?? "West Green";
  const oppName = gameMeta?.opponent_player ?? "Opponent";
  const isHome = searchParams.get("home") === "1";
  const legacyDraw = gameMeta?.status === "completed" && gameMeta?.winner === null;
  const isCompleted = matchComplete || legacyDraw;
  const legFinished = gameMeta?.status === "completed";
  const displayLegs = (() => {
    if (legacyDraw) return { wgd: 1, opp: 1 };
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

  const applyState = useCallback((res: any) => {
    setVisits(mapVisits(res));
    setGameMeta(res.meta);
    setOppRemaining(res.meta?.opponentRemaining ?? 501);
    setActiveSide(res.meta?.activeSide ?? "west");
    setThrowLog(res.meta?.throwLog ?? []);
    setWgdLegs(res.meta?.legs?.west ?? 0);
    setOppLegs(res.meta?.legs?.opp ?? 0);
    setMatchComplete((res.meta?.legs?.west ?? 0) + (res.meta?.legs?.opp ?? 0) >= 2);
  }, []);
  useEffect(() => {
    if (!gameId) { setLoading(false); setAlert("Choose a match from Fixtures to start scoring."); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const res = await loadGameStateAction(gameId);
      if (cancelled) return;
      if (!res.ok || !res.meta) { setAlert("Could not load this game"); return; }
      applyState(res);
      if (reopenedSide.current?.gameId === gameId) {
        setActiveSide(reopenedSide.current.side);
        reopenedSide.current = null;
      }
      const west = res.meta.legs?.west ?? 0;
      const opp = res.meta.legs?.opp ?? 0;
      setWgdLegs(west); setOppLegs(opp);
      setMatchComplete(west + opp >= 2);
      if (res.meta.status === "completed" && res.meta.winner !== null && west + opp < 2) {
        const next = await newLegAction(gameId);
        if (!next.ok) { setAlert(next.message); return; }
        router.replace(`/scoring?game=${next.gameId}${fixtureId ? `&fixture=${fixtureId}` : ""}&home=${isHome ? "1" : "0"}`);
      }
      const summaries = res.summaries ? { ok: true, summaries: res.summaries } : await getLegSummariesAction(gameId);
      if (summaries.ok) setLegSummaries(summaries.summaries.map((l: LegSummaryWire) => ({...l, threeDA: l.dartsTotal ? l.pointsTotal / l.dartsTotal * 3 : null})));
    })().catch(() => { if (!cancelled) setAlert("Could not load the score. Reload and try again."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [gameId, fixtureId, isHome, router, applyState]);

  const finishHint = useMemo(() => {
    if (remaining <= 1 || remaining > 170) return null;
    return finishRoutes[remaining];
  }, [remaining]);

  const appendDigit = (d: number) => {
    if (inputLocked) return;
    const next = (inputScore + d.toString()).replace(/^0+(?=\d)/, "");
    setInputScore(next.slice(0, 3));
  };

  const submitVisit = async (score: number, side: "west" | "opponent", darts: number, requestId: string) => {
    if (!gameId || !gameMeta) return;
    const res = await recordVisitAction(gameId, score, darts, side === "west" ? "west_green" : "opponent", gameMeta.revision, requestId);
    if (!res.ok) throw new Error(res.message || "Could not save the score.");
    applyState(res);
    setInputScore(""); setFinishPrompt(null); setAlert(null);
    setSavedMessage(`${side === "west" ? wgdName : oppName}: ${score === 0 ? "Miss (0)" : score} saved ✓`);
    const kind = getLegCelebration(res.meta?.status, res.meta?.winner, mapVisits(res));
    if (kind) {
      setCelebration((previous) => ({ kind, sequence: (previous?.sequence ?? 0) + 1 }));
    }
    if (res.meta?.status === "completed") {
      const summaries = res.summaries ? { ok: true, summaries: res.summaries } : await getLegSummariesAction(gameId);
      if (summaries.ok) setLegSummaries(summaries.summaries.map((l: LegSummaryWire) => ({...l, threeDA: l.dartsTotal ? l.pointsTotal / l.dartsTotal * 3 : null})));
      if (res.meta.winner !== null && (res.meta.legs?.west ?? 0) + (res.meta.legs?.opp ?? 0) < 2) {
        const next = await newLegAction(gameId);
        if (!next.ok) { setAlert(next.message || "Could not start the next leg. Reload to retry."); return; }
        router.replace(`/scoring?game=${next.gameId}${fixtureId ? `&fixture=${fixtureId}` : ""}&home=${isHome ? "1" : "0"}`);
      }
    }
  };
  const addScore = (score: number) => {
    if (inputLocked || !gameMeta || isCompleted || legFinished) return;
    if (!Number.isInteger(score) || score < 0 || score > 180) { setAlert("Enter a score from 0 to 180. Use Miss for a score of zero."); return; }
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
      setInputScore(""); setFinishPrompt(null); setConfirmUndo(false);
      setSavedMessage("Last score undone. The score and result have been updated.");
      if (res.meta?.id && res.meta.id !== gameId) {
        if (res.meta.activeSide === "west" || res.meta.activeSide === "opponent") reopenedSide.current = { gameId: res.meta.id, side: res.meta.activeSide };
        router.replace(`/scoring?game=${res.meta.id}${fixtureId ? `&fixture=${fixtureId}` : ""}&home=${isHome ? "1" : "0"}`);
      }
      const summaries = res.summaries ? { ok: true, summaries: res.summaries } : await getLegSummariesAction(gameId);
      if (summaries.ok) setLegSummaries(summaries.summaries.map((l: LegSummaryWire) => ({...l, threeDA: l.dartsTotal ? l.pointsTotal / l.dartsTotal * 3 : null})));
    });
  };

  const reloadLatest = () => {
    if (!gameId || pending) return;
    startTransition(async () => {
      const res = await loadGameStateAction(gameId);
      if (!res.ok || !res.meta) throw new Error(res.message || "Could not reload the score.");
      applyState(res); clearSaveError(); setAlert(null); setSavedMessage("Latest score loaded");
      if (res.meta.status === "completed" && res.meta.winner !== null && (res.meta.legs?.west ?? 0) + (res.meta.legs?.opp ?? 0) < 2) {
        const next = res.meta.nextGameId ? { ok: true, gameId: res.meta.nextGameId } : await newLegAction(gameId);
        if (!next.ok) throw new Error(next.message || "Could not start the next leg.");
        router.replace(`/scoring?game=${next.gameId}${fixtureId ? `&fixture=${fixtureId}` : ""}&home=${isHome ? "1" : "0"}`);
      }
    });
  };

  const legDots = (won: number) => (
    <span className="flex items-center justify-center gap-1.5" aria-label={`${won} legs won`}>
      {[0, 1].map((i) => (
        <span key={i} className={`leg-dot ${i < won ? "won" : ""}`} />
      ))}
    </span>
  );

  const undoPreviousLeg = throwLog.length === 0 && legSummaries.length === 1 && !isCompleted;
  const canUndo = throwLog.length > 0 || undoPreviousLeg;
  const requestUndo = () => {
    if (isCompleted || undoPreviousLeg) setConfirmUndo(true);
    else undo();
  };

  return (
    <main className="flex min-w-0 flex-col gap-3 fade-up">
      {celebration?.kind === "peas" && <PeaCelebration key={celebration.sequence} />}
      {celebration?.kind === "log" && <LogCelebration key={celebration.sequence} />}
      <header className="flex min-w-0 items-center justify-between gap-2">
        <a className="btn-secondary !min-h-11 !px-3" href={fixtureId ? `/fixtures/${fixtureId}` : "/fixtures"} aria-label="Back to fixture" aria-disabled={saving || saveError !== null}
          onClick={(event) => { if (saving || saveError !== null) { event.preventDefault(); setAlert("Wait for the score to save, or retry the kept entry before returning to the fixture."); } else if (inputScore !== "" && !window.confirm("This entered score has not been saved. Leave it and return to the fixture?")) { event.preventDefault(); } }}>← Fixture</a>
        <div className="min-w-0 text-center">
          <h1 className="text-lg font-bold leading-tight">501 Double-Out</h1>
          <p className="text-sm text-slate-500">{isCompleted ? "Match complete" : `Leg ${legSummaries.length + 1} of 2`}</p>
        </div>
        <span className="chip shrink-0">{loading ? "Loading" : isCompleted ? "Complete" : legFinished ? "Leg saved" : "Live"}</span>
      </header>
      {alert && <div role="alert" className="rounded-xl border border-red-300 p-3 text-sm text-red-800"><p>{alert}</p>{gameId && <button className="btn-secondary mt-2" disabled={pending} onClick={reloadLatest}>Reload latest score</button>}</div>}
      <ScoreSaveStatus pending={saving} saved={saved} error={saveError} retry={retrySave} reload={reloadLatest} savedMessage={savedMessage} />
      <div className={`grid min-w-0 gap-3 ${!isCompleted ? "league-live-grid md:grid-cols-2 md:items-start" : ""}`}>
        <section className="flex min-w-0 flex-col gap-3" aria-label="Match score">
          <div className="grid min-w-0 grid-cols-2 gap-2">
            {(["west", "opponent"] as const).map((side) => {
              const name = side === "west" ? wgdName : oppName;
              const score = side === "west" ? displayRemaining : displayOppRemaining;
              const legs = side === "west" ? displayLegs.wgd : displayLegs.opp;
              const active = activeSide === side && !legFinished && !isCompleted;
              return <button type="button" key={side} className={`score-panel min-w-0 !p-3 ${active ? "active" : ""}`}
                aria-pressed={active} aria-label={`${name}, ${score} remaining. ${legs} legs won.${!isCompleted ? " Select to enter their score." : ""}`}
                onClick={() => { setActiveSide(side); setInputScore(""); setAlert(null); }} disabled={inputLocked || finishPrompt !== null || legFinished || isCompleted}>
                <p className="break-words text-sm font-semibold text-slate-700">{name}</p>
                <p className="text-xs text-slate-500">{side === "west" ? "West Green" : "Opponent"}</p>
                <p key={`${side}-${score}`} className={`score-remaining mt-1 text-5xl ${side === "west" ? "text-emerald-700" : "text-slate-800"}`}>{score}</p>
                <div className="mt-2">{legDots(legs)}</div>
                <p className="mt-1 text-xs font-semibold text-slate-600">{active ? "Throwing now" : `${legs} ${legs === 1 ? "leg" : "legs"} won`}</p>
              </button>;
            })}
          </div>
          {finishHint && !isCompleted && <div className="finish-banner !block !p-3 !text-base" aria-label={`Checkout guidance for West Green player ${wgdName}`}>
            <p className="text-sm font-semibold">{wgdName} · West Green checkout</p>
            <p className="mt-1">{remaining} out: <strong>{finishHint}</strong></p>
            {activeSide === "opponent" && <p className="mt-1 text-sm font-normal">Opponent is throwing. This route is for {wgdName}.</p>}
          </div>}
          {!isCompleted && <p className="text-sm text-slate-600">Each score saves automatically. You can pause and return from the fixture.</p>}
        </section>
        {!isCompleted && legFinished && <section className="card text-sm"><p>Leg saved. Starting the second leg…</p><button className="btn-secondary mt-3" disabled={pending} onClick={reloadLatest}>Continue to second leg</button></section>}
        {!isCompleted && !legFinished && gameMeta && <section className="league-controls card flex min-w-0 flex-col gap-2 !p-3" aria-label="Enter score">
          {!finishPrompt ? <>
            <form onSubmit={(event) => { event.preventDefault(); if (inputScore !== "") addScore(Number(inputScore)); }} className="league-score-entry flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-50 p-2">
              <label htmlFor="league-visit-score" className="min-w-0 break-words text-sm font-semibold text-slate-700">{activeSide === "west" ? wgdName : oppName} scored</label>
              <input id="league-visit-score" inputMode="numeric" autoComplete="off" maxLength={3} value={inputScore} placeholder="—" disabled={inputLocked}
                onChange={(event) => { if (/^\d{0,3}$/.test(event.target.value)) { setInputScore(event.target.value); setAlert(null); } }}
                className="!w-20 !min-w-0 !p-1 text-center !text-3xl font-bold" aria-describedby="league-score-help" />
            </form>
            <div className="league-keypad grid grid-cols-3 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <button key={n} type="button" className="keypad-key !min-h-11 !py-2 !text-2xl" disabled={inputLocked} onClick={() => appendDigit(n)}>{n}</button>)}
              <button type="button" className="keypad-key !min-h-11 !py-2 !text-lg" onClick={() => setInputScore((s) => s.slice(0, -1))} disabled={inputLocked || inputScore === ""} aria-label="Delete digit">⌫</button>
              <button type="button" className="keypad-key !min-h-11 !py-2 !text-2xl" disabled={inputLocked} onClick={() => appendDigit(0)}>0</button>
              <button type="button" className="btn-primary !min-h-11 !px-1 !py-2 !text-base" onClick={() => addScore(Number(inputScore))} disabled={inputLocked || inputScore === ""} aria-label="Save entered score">Save</button>
            </div>
            <button ref={undoTriggerRef} type="button" className="league-undo btn-secondary !min-h-11 text-sm" onClick={requestUndo} disabled={inputLocked || !canUndo}>{undoPreviousLeg ? "Undo previous leg checkout" : "Undo last score"}</button>
            <p id="league-score-help" className="text-sm text-slate-500">Quick scores below save immediately. Empty means no entry.</p>
            <div className="league-quick-scores grid grid-cols-4 gap-1.5" aria-label="Save a quick score">
              {[0, 26, 45, 60, 85, 100, 140, 180].map((q) => <button key={q} type="button" className="btn-secondary !min-h-11 !px-1 !py-2 !text-sm" onClick={() => addScore(q)} disabled={inputLocked} aria-label={`Save ${q === 0 ? "Miss, zero" : q} for ${activeSide === "west" ? wgdName : oppName}`}>{q === 0 ? "Miss (0)" : q}</button>)}
            </div>
          </> : <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center" role="group" aria-label="Confirm checkout">
            <p className="text-lg font-bold text-emerald-800">Confirm checkout</p>
            <p className="break-words text-sm text-slate-700">{finishPrompt.side === "west" ? wgdName : oppName}: {finishPrompt.score}. How many darts were used?</p>
            <div className="grid grid-cols-3 gap-2">{[1, 2, 3].map((d) => <button key={d} type="button" className="btn-primary !min-h-12 !px-1" disabled={inputLocked || !canFinishFrom(finishPrompt.score, d)} onClick={() => { const requestId = crypto.randomUUID(); startTransition(() => submitVisit(finishPrompt.score, finishPrompt.side, d, requestId)); }}>{d} dart{d > 1 ? "s" : ""}</button>)}</div>
            <button type="button" className="btn-secondary" disabled={inputLocked} onClick={() => setFinishPrompt(null)}>Cancel checkout</button>
          </div>}
        </section>}
      </div>
      {isCompleted && <section className="card flex flex-col gap-3" aria-label="Match result">
        <h2 className="text-xl font-bold">{displayLegs.wgd === displayLegs.opp ? "Match drawn" : displayLegs.wgd > displayLegs.opp ? "West Green win" : "Opponent win"} · {displayLegs.wgd}–{displayLegs.opp}</h2>
        <p className="text-sm text-slate-600">Both legs are saved. Return to the fixture to score the next match.</p>
        {fixtureId && <a className="btn-primary" href={`/fixtures/${fixtureId}`}>Continue to fixture</a>}
        {gameId && <a className="btn-secondary" href={`/matches/${gameId}`}>Review match and statistics</a>}
        <button ref={undoTriggerRef} type="button" className="btn-secondary" onClick={requestUndo} disabled={inputLocked || !canUndo}>Correct result</button>
      </section>}
      {confirmUndo && <section className="card border border-amber-300" role="group" aria-labelledby="league-undo-heading">
        <h2 id="league-undo-heading" className="font-semibold">Reopen this leg and undo its checkout?</h2>
        <p className="mt-2 text-sm text-slate-600">The last checkout will be removed. Match and fixture results will update so you can enter the correct score. An untouched next leg will be removed.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button ref={undoConfirmRef} className="btn-primary" disabled={inputLocked} onClick={undo}>Reopen and undo checkout</button><button className="btn-secondary" disabled={inputLocked} onClick={() => { setConfirmUndo(false); undoTriggerRef.current?.focus(); }}>Keep result</button></div>
      </section>}
      <details className="card" open={isCompleted}>
        <summary className="cursor-pointer font-semibold">West Green visit history{visits.length ? ` · ${visits.length} scores this leg` : ""}</summary>
        {!visits.length && <p className="mt-3 text-sm text-slate-600">No West Green visits in this leg yet.</p>}
        <ol className="mt-3 flex flex-col gap-2">{visits.map((v, idx) => <li key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2 text-sm">
          <span className="font-semibold">#{idx + 1} · {v.score === 0 ? "Miss (0)" : v.score}</span>
          <span className="text-slate-600">{visits.slice(0, idx + 1).reduce((s, x) => s + x.darts, 0)} darts · {v.remainingAfter} left</span>
          {v.isBust && <span className="text-red-600">Bust</span>}{v.isCheckout && <span className="text-emerald-700">Checkout</span>}
        </li>)}</ol>
        {legSummaries.length > 0 && <div className="mt-4 flex flex-col gap-2"><h2 className="font-semibold">Completed legs</h2>{legSummaries.map((leg, i) => <div key={i} className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600">
          <p className="break-words font-semibold text-slate-800">Leg {i + 1}: {leg.winner === "west" ? wgdName : oppName}</p>
          <p>West Green · {leg.dartsTotal} darts · 3-dart average {leg.threeDA !== null ? leg.threeDA.toFixed(1) : "—"}</p>
          <p>First 9 average: {leg.firstNine !== null ? leg.firstNine.toFixed(1) : "—"}</p>
        </div>)}</div>}
      </details>
    </main>
  );
}
