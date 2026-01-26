"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { finishRoutes } from "@/lib/finishRoutes";
import {
  loadPracticeStateAction,
  recordPracticeVisitAction,
  undoLastPracticeVisitAction
} from "./actions";

const START_FALLBACK = 501;

export default function PracticeScoringClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const gameId = searchParams.get("game");
  const [visits, setVisits] = useState<any[]>([]);
  const [remainingA, setRemainingA] = useState<number>(START_FALLBACK);
  const [remainingB, setRemainingB] = useState<number>(START_FALLBACK);
  const [inputScore, setInputScore] = useState(0);
  const [activeSide, setActiveSide] = useState<"a" | "b">("a");
  const [finishHint, setFinishHint] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [meta, setMeta] = useState<any>(null);
  const [alert, setAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!gameId) return;
    startTransition(async () => {
      const res = await loadPracticeStateAction(gameId);
      if (res.ok) {
        setVisits(
          res.visits.map((v: any) => ({
            score: v.score,
            darts: v.darts,
            remainingAfter: v.remaining_after,
            isBust: v.is_bust,
            isCheckout: v.is_checkout
          }))
        );
        setRemainingA(res.remainingA ?? START_FALLBACK);
        setRemainingB(res.remainingB ?? START_FALLBACK);
        setFinishHint(res.finishHint ?? null);
        setMeta(res.meta ?? null);
      }
    });
  }, [gameId]);

  const startScore = meta?.practice_sessions?.start_score ?? START_FALLBACK;
  const playerAName = meta?.practice_sessions?.player_a?.name ?? "Player A";
  const playerBName = meta?.practice_sessions?.player_b?.name ?? "Player B";

  const handleKey = (n: number) => {
    setInputScore((prev) => {
      const next = Number(`${prev}${n}`);
      return next > 180 ? prev : next;
    });
  };
  const clearInput = () => setInputScore(0);

  const submitScore = () => {
    if (!gameId) return;
    const score = inputScore;
    clearInput();
    startTransition(async () => {
      const res = await recordPracticeVisitAction(gameId, activeSide, score, undefined);
      if (!res.ok) {
        setAlert(res.message ?? "Error recording score");
        return;
      }
      setAlert(null);
      // reload state
      const reload = await loadPracticeStateAction(gameId);
      if (reload.ok) {
        setVisits(
          reload.visits.map((v: any) => ({
            score: v.score,
            darts: v.darts,
            remainingAfter: v.remaining_after,
            isBust: v.is_bust,
            isCheckout: v.is_checkout
          }))
        );
        setRemainingA(reload.remainingA ?? startScore);
        setRemainingB(reload.remainingB ?? startScore);
        setFinishHint(reload.finishHint ?? null);
        setMeta(reload.meta ?? null);
        setActiveSide(activeSide === "a" ? "b" : "a");
      }
    });
  };

  const undo = () => {
    if (!gameId) return;
    startTransition(async () => {
      await undoLastPracticeVisitAction(gameId);
      const reload = await loadPracticeStateAction(gameId);
      if (reload.ok) {
        setVisits(
          reload.visits.map((v: any) => ({
            score: v.score,
            darts: v.darts,
            remainingAfter: v.remaining_after,
            isBust: v.is_bust,
            isCheckout: v.is_checkout
          }))
        );
        setRemainingA(reload.remainingA ?? startScore);
        setRemainingB(reload.remainingB ?? startScore);
        setFinishHint(reload.finishHint ?? null);
        setMeta(reload.meta ?? null);
        setActiveSide(activeSide === "a" ? "b" : "a");
      }
    });
  };

  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded-md text-sm font-semibold ${
              activeSide === "a" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-800"
            }`}
            onClick={() => setActiveSide("a")}
          >
            Player A
          </button>
          <button
            className={`px-3 py-1 rounded-md text-sm font-semibold ${
              activeSide === "b" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-800"
            }`}
            onClick={() => setActiveSide("b")}
          >
            Player B
          </button>
        </div>
        <div className="text-sm text-slate-600">Input: {inputScore}</div>
      </div>

      {finishHint && <div className="text-sm text-emerald-700">Finish: {finishHint}</div>}
      {alert && <div className="text-sm text-red-600">{alert}</div>}

      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => (
          <button
            key={n}
            className="rounded-md border border-slate-300 bg-white py-4 text-lg font-semibold hover:bg-slate-50"
            onClick={() => handleKey(n)}
            disabled={pending}
          >
            {n}
          </button>
        ))}
        <button
          className="rounded-md bg-emerald-600 text-white py-3 font-semibold"
          onClick={submitScore}
          disabled={pending}
        >
          Enter
        </button>
        <button
          className="rounded-md bg-slate-100 text-slate-800 py-3 font-semibold"
          onClick={clearInput}
          disabled={pending}
        >
          Clear
        </button>
        <button
          className="rounded-md bg-red-50 text-red-700 py-3 font-semibold"
          onClick={undo}
          disabled={pending}
        >
          Undo
        </button>
      </div>

      <div className="flex gap-2 text-sm">
        <div className={`rounded-lg border px-3 py-2 ${activeSide === "a" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
          <p className="text-xs uppercase text-emerald-700">{playerAName} remaining</p>
          <p className="text-2xl font-semibold text-emerald-900">{remainingA}</p>
        </div>
        <div className={`rounded-lg border px-3 py-2 ${activeSide === "b" ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-white"}`}>
          <p className="text-xs uppercase text-slate-600">{playerBName} remaining</p>
          <p className="text-2xl font-semibold text-slate-900">{remainingB}</p>
        </div>
      </div>

      <div className="mt-2 text-sm text-slate-700">
        <p className="font-semibold mb-1">Visits</p>
        <div className="flex flex-col gap-1">
          {visits.map((v, idx) => (
            <div key={idx} className="flex justify-between rounded-md border border-slate-200 px-2 py-1">
              <span>#{idx + 1}</span>
              <span>{v.score}</span>
              <span>{v.darts} darts</span>
              <span>Rem: {v.remainingAfter}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
