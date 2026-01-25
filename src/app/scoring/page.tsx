"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { finishRoutes } from "@/lib/finishRoutes";
import {
  loadGameStateAction,
  recordVisitAction,
  undoLastVisitAction,
  newLegAction,
  setOpponentWinAction,
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

const isValidCheckoutLocal = (remaining: number, score: number) => remaining - score === 0;

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
  const [pending, startTransition] = useTransition();
  const [alert, setAlert] = useState<string | null>(null);
  const [gameMeta, setGameMeta] = useState<{
    status: string;
    winner: string | null;
    darts_thrown?: number | null;
    players?: { name?: string | null };
    opponent_player?: string | null;
    legs?: { west?: number; opp?: number };
  } | null>(null);
  const [activeSide, setActiveSide] = useState<"west" | "opponent">("west");
  const [inputScore, setInputScore] = useState("");
  const [oppRemaining, setOppRemaining] = useState(START_SCORE);
  const [wgdLegs, setWgdLegs] = useState(0);
  const [oppLegs, setOppLegs] = useState(0);
  const [finishPrompt, setFinishPrompt] = useState<{ score: number } | null>(null);
  const [legSummaries, setLegSummaries] = useState<LegSummary[]>([]);
  const [matchComplete, setMatchComplete] = useState(false);
  const [lastThrowSide, setLastThrowSide] = useState<"west" | "opponent" | null>(null);
  const [throwLog, setThrowLog] = useState<("west" | "opponent")[]>([]);
  const [oppRemainingStack, setOppRemainingStack] = useState<number[]>([]);
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
  const displayRemaining = isCompleted
    ? gameMeta?.winner === "west_green"
      ? 0
      : START_SCORE
    : remaining;
  const displayOppRemaining = isCompleted
    ? gameMeta?.winner === "opponent"
      ? 0
      : START_SCORE
    : oppRemaining;

  const getStarter = (legIndex: number) => {
    if (isHome) {
      return legIndex % 2 === 0 ? "opponent" : "west";
    }
    return legIndex % 2 === 0 ? "west" : "opponent";
  };

  useEffect(() => {
    if (!gameId) return;
    startTransition(async () => {
      const res = await loadGameStateAction(gameId);
      if (res.ok && res.visits) {
        setVisits(
          res.visits.map((v: any) => ({
            score: v.score,
            darts: v.darts,
            remainingAfter: v.remaining_after,
            isBust: v.is_bust,
            isCheckout: v.is_checkout
          }))
        );
        if (res.meta) {
          const status = res.meta.status || "in_progress";
          const winner = res.meta.winner ?? null;
          setGameMeta({
            status,
            winner,
            darts_thrown: res.meta.darts_thrown,
            players: res.meta.players,
            opponent_player: res.meta.opponent_player,
            legs: res.meta.legs
          } as any);

          if (status !== "in_progress") {
            setMatchComplete(true);
            const legsMeta = res.meta.legs;
            if (legsMeta) {
              setWgdLegs(legsMeta.west ?? 0);
              setOppLegs(legsMeta.opp ?? 0);
            } else {
              if (winner === "west_green") {
                setWgdLegs(2);
                setOppLegs(0);
              } else if (winner === "opponent") {
                setWgdLegs(0);
                setOppLegs(2);
              } else {
                setWgdLegs(1);
                setOppLegs(1);
              }
            }
            // pull accurate leg summaries from server for the matchup
            const summariesRes = await getLegSummariesAction(gameId);
            if (summariesRes.ok) {
              setLegSummaries(
                summariesRes.summaries.map((l: LegSummaryWire) => ({
                  winner: l.winner,
                  dartsTotal: l.dartsTotal,
                  pointsTotal: l.pointsTotal,
                  threeDA: l.dartsTotal ? (l.pointsTotal / l.dartsTotal) * 3 : null,
                  firstNine: l.firstNine,
                  firstNinePoints: l.firstNinePoints,
                  firstNineDarts: l.firstNineDarts,
                  buckets: l.buckets
                }))
              );
            }
          }
        }
        if (res.visits.length === 0) {
          setActiveSide(getStarter(wgdLegs + oppLegs));
        }
      } else {
        // set starting side on fresh leg
        setActiveSide(getStarter(0));
      }
    });
  }, [gameId]);

  const finishHint = useMemo(() => {
    if (remaining <= 1 || remaining > 170) return null;
    return finishRoutes[remaining];
  }, [remaining]);

  const appendDigit = (d: number) => {
    const next = (inputScore + d.toString()).replace(/^0+/, "");
    setInputScore(next.slice(0, 3));
  };

  const resetLegState = () => {
    setVisits([]);
    setOppRemaining(START_SCORE);
    setAlert(null);
    setInputScore("");
    setThrowLog([]);
    setOppRemainingStack([]);
    setLastThrowSide(null);
    const legIndex = wgdLegs + oppLegs;
    setActiveSide(getStarter(legIndex));
  };

  const switchSide = () => setActiveSide((prev) => (prev === "west" ? "opponent" : "west"));

  const addLegSummary = (winner: "west" | "opponent", legVisits: Visit[]) => {
    const dartsTotal = legVisits.reduce((s, v) => s + v.darts, 0);
    const points = legVisits.reduce((s, v) => s + (v.isBust ? 0 : v.score), 0);
    const threeDA = dartsTotal ? (points / dartsTotal) * 3 : null;
    // First 9 darts avg (first 3 visits = 9 darts); ignore if <9 darts recorded
    const firstThreeVisits = legVisits.slice(0, 3);
    const dartsFirst9 = firstThreeVisits.reduce((s, v) => s + v.darts, 0);
    const pointsFirst9 = firstThreeVisits.reduce((s, v) => s + (v.isBust ? 0 : v.score), 0);
    const firstNine = dartsFirst9 === 9 ? (pointsFirst9 / dartsFirst9) * 3 : null;
    const buckets = { "26": 0, "60+": 0, "80+": 0, "100+": 0, "120+": 0, "140+": 0, "170+": 0, "180": 0 };
    legVisits.forEach((v) => {
      const s = v.score;
      if (s === 26) buckets["26"]++;
      if (s >= 60 && s < 80) buckets["60+"]++;
      if (s >= 80 && s < 100) buckets["80+"]++;
      if (s >= 100 && s < 120) buckets["100+"]++;
      if (s >= 120 && s < 140) buckets["120+"]++;
      if (s >= 140 && s < 170) buckets["140+"]++;
      if (s >= 170 && s < 180) buckets["170+"]++;
      if (s === 180) buckets["180"]++;
    });
    setLegSummaries((prev) => [
      ...prev,
      {
        winner,
        dartsTotal,
        pointsTotal: points,
        threeDA,
        firstNine,
        firstNinePoints: dartsFirst9 === 9 ? pointsFirst9 : null,
        firstNineDarts: dartsFirst9 === 9 ? dartsFirst9 : null,
        buckets
      }
    ]);
  };

  const finishLeg = async (winner: "west" | "opponent", legVisits: Visit[]) => {
    addLegSummary(winner, legVisits);
    const nextW = winner === "west" ? wgdLegs + 1 : wgdLegs;
    const nextO = winner === "opponent" ? oppLegs + 1 : oppLegs;
    setWgdLegs(nextW);
    setOppLegs(nextO);
    const totalLegs = nextW + nextO;
    if (totalLegs >= 2) {
      setMatchComplete(true);
      setGameMeta((prev) => ({
        ...(prev || {}),
        status: "completed",
        winner: winner === "west" ? "west_green" : "opponent",
        legs: { west: nextW, opp: nextO }
      }));
      setFinishPrompt(null);
      return;
    }
    // start next leg (new game record) if possible, alternating starter
    if (gameId) {
      const resNew = await newLegAction(gameId);
      if (resNew.ok && resNew.gameId) {
        resetLegState();
        // alternate starting side each leg
        setActiveSide(getStarter(nextW + nextO));
        setFinishPrompt(null);
        setMatchComplete(false);
        router.replace(`/scoring?game=${resNew.gameId}${fixtureId ? `&fixture=${fixtureId}` : ""}`);
        return;
      }
    }
    resetLegState();
    setFinishPrompt(null);
  };

  const addScore = (score: number) => {
    if (!Number.isInteger(score) || score < 0 || score > 180) return;
    if (activeSide === "west") {
      if (gameId) {
        const isFinish = isValidCheckoutLocal(remaining, score);
        if (isFinish) {
          setFinishPrompt({ score });
          return;
        }
        startTransition(async () => {
          const res = await recordVisitAction(gameId, score);
          if (res.ok && res.visits) {
            const mapped = res.visits.map((v: any) => ({
              score: v.score,
              darts: v.darts,
              remainingAfter: v.remaining_after,
              isBust: v.is_bust,
              isCheckout: v.is_checkout
            }));
            setVisits(mapped);
            setAlert(null);
            if (res.meta) setGameMeta(res.meta);
            setThrowLog((prev) => [...prev, "west"]);
            setLastThrowSide("west");
            switchSide();
          }
        });
      } else {
        const dartsUsed = 3;
        const next = remaining - score;
        const isCheckout = isValidCheckoutLocal(remaining, score);
        const isBust = !isCheckout && (next < 0 || next === 1 || next === 0);
        const remainingAfter = isBust ? remaining : next;
        const visit: Visit = { score, darts: dartsUsed, remainingAfter, isBust, isCheckout };
        const newVisits = [...visits, visit];
        setVisits(newVisits);
        if (remainingAfter === 0 && isCheckout) {
          setAlert("Leg completed - mock mode");
          finishLeg("west", newVisits);
        } else {
          setAlert(null);
          switchSide();
        }
        setThrowLog((prev) => [...prev, "west"]);
        setLastThrowSide("west");
      }
    } else {
      // opponent tracked locally only
      const next = oppRemaining - score;
      const isCheckout = isValidCheckoutLocal(oppRemaining, score);
      const isBust = !isCheckout && (next < 0 || next === 1 || next === 0);
      const remainingAfter = isBust ? oppRemaining : next;
      setOppRemainingStack((st) => [...st, oppRemaining]);
      setOppRemaining(remainingAfter);
      if (isCheckout && remainingAfter === 0) {
        setAlert("Leg completed - Opponent");
        if (gameId) {
          startTransition(async () => {
            await setOpponentWinAction(gameId);
          });
        }
        finishLeg("opponent", visits);
        setOppRemaining(START_SCORE);
      } else setAlert(null);
      switchSide();
      setThrowLog((prev) => [...prev, "opponent"]);
      setLastThrowSide("opponent");
    }
    setInputScore("");
  };

  const undo = () => {
    if (!throwLog.length) return;
    const newLog = throwLog.slice(0, -1);
    const last = throwLog[throwLog.length - 1];

    if (last === "west") {
      if (gameId) {
        startTransition(async () => {
          const res = await undoLastVisitAction(gameId);
          if (res.ok && res.visits) {
            const mapped = res.visits.map((v: any) => ({
              score: v.score,
              darts: v.darts,
              remainingAfter: v.remaining_after,
              isBust: v.is_bust,
              isCheckout: v.is_checkout
            }));
            setVisits(mapped);
          } else {
            setVisits((prev) => prev.slice(0, -1));
          }
        });
      } else {
        setVisits((prev) => prev.slice(0, -1));
      }
      setActiveSide("west");
    } else if (last === "opponent") {
      const prevRem = oppRemainingStack[oppRemainingStack.length - 1] ?? START_SCORE;
      setOppRemainingStack((st) => st.slice(0, -1));
      setOppRemaining(prevRem);
      setActiveSide("opponent");
    }

    setThrowLog(newLog);
    setLastThrowSide(newLog.length ? newLog[newLog.length - 1] : null);
    setAlert(null);
  };

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <p className="text-sm text-slate-600">Live scoring</p>
        <h1 className="text-2xl font-semibold">501 Double-Out</h1>
        {fixtureId && <p className="text-sm text-slate-700 mt-1">Fixture: {fixtureId}</p>}
        {gameId && (
          <p className="text-sm">
            <span
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${
                isCompleted ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
              }`}
            >
              {isCompleted ? "Completed" : "In progress"}
            </span>
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <a
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            href={fixtureId ? `/fixtures/${fixtureId}` : "/fixtures"}
          >
            ← Back to fixture
          </a>
          <a
            className="inline-flex items-center rounded-md bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-300"
            href="/dashboard"
          >
            Dashboard
          </a>
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div
            className={`rounded-xl p-4 shadow-sm border ${
              activeSide === "west" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
            }`}
          >
            <span className="text-sm text-slate-600 block">{wgdName} remaining</span>
            <span className="text-5xl font-semibold text-emerald-700">{displayRemaining}</span>
          </div>
          <div
            className={`rounded-xl p-4 shadow-sm border ${
              activeSide === "opponent" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"
            }`}
          >
            <span className="text-sm text-slate-600 block">{oppName} remaining</span>
            <span className="text-3xl font-semibold text-slate-800">{displayOppRemaining}</span>
          </div>
          <div className="rounded-xl p-4 shadow-sm border border-slate-200 bg-white text-sm text-slate-700">
            <p className="font-semibold mb-1">Legs</p>
            <p>
              {wgdName} {displayLegs.wgd} - {displayLegs.opp} {oppName}
            </p>
            <p className="text-xs text-slate-500">Best of 2</p>
          </div>
        </div>
        {finishHint && !isCompleted && (
          <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">
            Finish: {finishHint}
          </p>
        )}
        {alert && <p className="mt-2 text-emerald-700 font-semibold">{alert}</p>}
        {isCompleted && (
          <div className="mt-3 flex flex-wrap gap-3">
            {fixtureId && (
              <a className="text-sm text-emerald-700 underline font-semibold" href={`/fixtures/${fixtureId}`}>
                Back to fixture
              </a>
            )}
          </div>
        )}
      </header>

      {!isCompleted && (
      <section className="card flex flex-col gap-3" id="summary">
        <h2 className="text-lg font-semibold">Enter score</h2>
        <div className="flex gap-2 items-center">
        <button
          className={`rounded-md px-4 py-2 text-sm font-semibold ${activeSide === "west" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-800"}`}
          onClick={() => setActiveSide("west")}
            disabled={finishPrompt !== null || isCompleted}
        >
          {wgdName}
        </button>
        <button
          className={`rounded-md px-4 py-2 text-sm font-semibold ${activeSide === "opponent" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-800"}`}
          onClick={() => setActiveSide("opponent")}
            disabled={finishPrompt !== null || isCompleted}
        >
          {oppName}
        </button>
          <span className="ml-auto text-sm text-slate-600">Input:</span>
          <span className="text-3xl font-semibold text-slate-900">{inputScore || "0"}</span>
        </div>

        {!finishPrompt && !isCompleted && (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <button
                  key={n}
                  className="rounded-md bg-slate-100 px-4 py-4 text-2xl font-semibold hover:bg-slate-200"
                  onClick={() => appendDigit(n)}
                >
                  {n}
                </button>
              ))}
              <button
                className="rounded-md bg-slate-100 px-4 py-4 text-2xl font-semibold hover:bg-slate-200"
                onClick={() => appendDigit(0)}
              >
                0
              </button>
              <button
                className="rounded-md bg-red-50 text-red-700 px-4 py-4 font-semibold hover:bg-red-100"
                onClick={() => setInputScore("")}
              >
                Clear
              </button>
              <button
                className="rounded-md bg-emerald-600 text-white px-4 py-4 font-semibold hover:bg-emerald-700"
                onClick={() => addScore(parseInt(inputScore || "0", 10))}
                disabled={pending}
              >
                Enter
              </button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:border-emerald-200"
                onClick={undo}
                disabled={pending}
              >
                Undo last score
              </button>
            </div>
          </>
        )}

        {finishPrompt && (
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
            <p className="text-sm font-semibold">Checkout darts used?</p>
            <div className="flex gap-2">
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:border-emerald-200"
                  onClick={() => {
                    if (!gameId) return;
                    startTransition(async () => {
                      const res = await recordVisitAction(gameId, finishPrompt.score, d);
                      if (res.ok && res.visits) {
                        const legVisits = res.visits.map((v: any) => ({
                          score: v.score,
                          darts: v.darts,
                          remainingAfter: v.remaining_after,
                          isBust: v.is_bust,
                          isCheckout: v.is_checkout
                        }));
                        setVisits(legVisits);
                        setAlert("Leg completed - West Green wins");
                        await finishLeg("west", legVisits);
                        setInputScore("");
                      }
                      setFinishPrompt(null);
                    });
                  }}
                >
                  {d} dart{d > 1 ? "s" : ""}
                </button>
              ))}
              <button
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold hover:border-red-200 text-red-700"
                onClick={() => setFinishPrompt(null)}
              >
                Cancel
              </button>
            </div>
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
