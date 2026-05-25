"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type { LegStats } from "@/lib/scoringUtils";
import {
  loadPracticeStateAction,
  recordPracticeVisitAction,
  undoLastPracticeVisitAction,
  deletePracticeSessionFromScoringAction,
} from "./scoring/actions";

const START_FALLBACK = 501;

function StatGrid({ stats, name }: { stats: LegStats; name: string }) {
  const b = stats.buckets;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-semibold text-slate-700 truncate">{name}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-slate-600">
        <span>
          3DA: <strong>{stats.threeDartAvg != null ? stats.threeDartAvg.toFixed(1) : "–"}</strong>
        </span>
        <span>
          F9: <strong>{stats.firstNineAvg != null ? stats.firstNineAvg.toFixed(1) : "–"}</strong>
        </span>
        <span>
          Darts: <strong>{stats.totalDarts}</strong>
        </span>
        <span>
          High: <strong>{stats.highFinish ?? "–"}</strong>
        </span>
        {b.t180 > 0 && (
          <span className="text-purple-700 col-span-2">
            180s: <strong>{b.t180}</strong>
          </span>
        )}
        {b.t170 > 0 && (
          <span>
            170+: <strong>{b.t170}</strong>
          </span>
        )}
        {b.t140 > 0 && (
          <span>
            140+: <strong>{b.t140}</strong>
          </span>
        )}
        {b.t120 > 0 && (
          <span>
            120+: <strong>{b.t120}</strong>
          </span>
        )}
        {b.t100 > 0 && (
          <span>
            100+: <strong>{b.t100}</strong>
          </span>
        )}
        {b.t80 > 0 && (
          <span>
            80+: <strong>{b.t80}</strong>
          </span>
        )}
        {b.t60 > 0 && (
          <span>
            60+: <strong>{b.t60}</strong>
          </span>
        )}
        {b.t26 > 0 && (
          <span>
            26s: <strong>{b.t26}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

export default function PracticeScoringClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const gameId = searchParams.get("game");
  const sessionId = searchParams.get("session");

  const [remainingA, setRemainingA] = useState<number>(START_FALLBACK);
  const [remainingB, setRemainingB] = useState<number>(START_FALLBACK);
  const [inputScore, setInputScore] = useState(0);
  const [activeSide, setActiveSide] = useState<"a" | "b">("a");
  const [finishHintA, setFinishHintA] = useState<string | null>(null);
  const [finishHintB, setFinishHintB] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [meta, setMeta] = useState<any>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [statsA, setStatsA] = useState<LegStats | null>(null);
  const [statsB, setStatsB] = useState<LegStats | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const applyState = (res: any) => {
    if (!res.ok) return;
    setRemainingA(res.remainingA ?? START_FALLBACK);
    setRemainingB(res.remainingB ?? START_FALLBACK);
    setFinishHintA(res.finishHintA ?? null);
    setFinishHintB(res.finishHintB ?? null);
    setMeta(res.meta ?? null);
    setStatsA(res.statsA ?? null);
    setStatsB(res.statsB ?? null);
  };

  useEffect(() => {
    if (!gameId) return;
    startTransition(async () => {
      const res = await loadPracticeStateAction(gameId);
      applyState(res);
    });
  }, [gameId]);

  const playerAName = meta?.practice_sessions?.player_a?.name ?? "Player A";
  const playerBName = meta?.practice_sessions?.player_b?.name ?? "Player B";
  const gameStatus = meta?.status ?? "in_progress";
  const winner = meta?.winner ?? null;
  const legIndex = meta?.leg_index ?? 1;
  const legsToPlay = meta?.practice_sessions?.legs_to_play ?? 1;
  const sessionStatus = meta?.practice_sessions?.status ?? "in_progress";
  const activeFinishHint = activeSide === "a" ? finishHintA : finishHintB;

  const handleKey = (n: number) => {
    setInputScore((prev) => {
      const next = Number(`${prev}${n}`);
      return next > 180 ? prev : next;
    });
  };
  const clearInput = () => setInputScore(0);

  const submitScore = () => {
    if (!gameId || gameStatus === "completed") return;
    const score = inputScore;
    clearInput();
    startTransition(async () => {
      const res = await recordPracticeVisitAction(gameId, activeSide, score, undefined);
      if (!res.ok) {
        setAlert((res as any).message ?? "Error recording score");
        return;
      }
      setAlert(null);
      const reload = await loadPracticeStateAction(gameId);
      applyState(reload);
      if (reload.ok && reload.meta?.status !== "completed") {
        setActiveSide(activeSide === "a" ? "b" : "a");
      }
    });
  };

  const undo = () => {
    if (!gameId) return;
    startTransition(async () => {
      const res = await undoLastPracticeVisitAction(gameId);
      const reload = await loadPracticeStateAction(gameId);
      applyState(reload);
      const thrower = (res as any).undidThrower;
      if (thrower === "player_a") setActiveSide("a");
      else if (thrower === "player_b") setActiveSide("b");
    });
  };

  const goToNextLeg = () => {
    if (!sessionId) return;
    router.push(`/practice/scoring?session=${sessionId}`);
    router.refresh();
  };

  const deleteSession = () => {
    if (!sessionId) return;
    startTransition(async () => {
      await deletePracticeSessionFromScoringAction(sessionId);
      router.push("/practice");
    });
  };

  if (!gameId) {
    return <div className="card text-sm text-slate-600">Loading…</div>;
  }

  // Post-leg summary
  if (gameStatus === "completed") {
    const winnerName = winner === "player_a" ? playerAName : winner === "player_b" ? playerBName : "–";
    return (
      <div className="flex flex-col gap-4">
        <div className="card">
          <p className="text-sm text-slate-600">Leg {legIndex} of {legsToPlay}</p>
          <h2 className="text-2xl font-semibold mt-0.5">{winnerName} wins!</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className={`card ${winner === "player_a" ? "border-emerald-300 ring-1 ring-emerald-200" : ""}`}>
            {winner === "player_a" && (
              <p className="text-xs font-semibold text-emerald-600 mb-1">Winner</p>
            )}
            {statsA && <StatGrid stats={statsA} name={playerAName} />}
          </div>
          <div className={`card ${winner === "player_b" ? "border-emerald-300 ring-1 ring-emerald-200" : ""}`}>
            {winner === "player_b" && (
              <p className="text-xs font-semibold text-emerald-600 mb-1">Winner</p>
            )}
            {statsB && <StatGrid stats={statsB} name={playerBName} />}
          </div>
        </div>

        <div className="card flex flex-col gap-2">
          {sessionStatus === "completed" ? (
            <>
              <p className="text-sm font-semibold text-slate-700">Session complete</p>
              <p className="text-xs text-slate-600">{legsToPlay} leg{legsToPlay !== 1 ? "s" : ""} played</p>
              <a
                href="/dashboard"
                className="rounded-md bg-emerald-600 px-4 py-3 text-center text-white font-semibold hover:bg-emerald-700"
              >
                Dashboard
              </a>
              <a
                href="/practice"
                className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm text-slate-700 hover:border-slate-400"
              >
                Back to sessions
              </a>
            </>
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Leg {legIndex + 1} of {legsToPlay} ready
              </p>
              <button
                onClick={goToNextLeg}
                className="rounded-md bg-emerald-600 px-4 py-3 text-white font-semibold hover:bg-emerald-700"
              >
                Start leg {legIndex + 1}
              </button>
              <a
                href="/practice"
                className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm text-slate-700 hover:border-slate-400"
              >
                Back to sessions
              </a>
            </>
          )}
          <div className="border-t border-slate-100 pt-2">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 flex-1">Delete this session?</span>
                <button
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  onClick={deleteSession}
                  disabled={pending}
                >
                  Yes, delete
                </button>
                <button
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                onClick={() => setConfirmDelete(true)}
              >
                Delete session
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // In-progress scoring
  return (
    <div className="card flex flex-col gap-3">
      {/* Navigation + leg progress */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
        <div className="flex items-center gap-2">
          <a
            href="/dashboard"
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-slate-400 hover:text-slate-800"
          >
            ← Dashboard
          </a>
          <a
            href="/practice"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
          >
            Sessions
          </a>
        </div>
        {meta && (
          <span className="text-sm font-semibold text-slate-800">Leg {legIndex} of {legsToPlay}</span>
        )}
      </div>

      {/* Player toggle + input display */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            className={`px-3 py-1 rounded-md text-sm font-semibold ${
              activeSide === "a" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-800"
            }`}
            onClick={() => setActiveSide("a")}
          >
            {playerAName}
          </button>
          <button
            className={`px-3 py-1 rounded-md text-sm font-semibold ${
              activeSide === "b" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-800"
            }`}
            onClick={() => setActiveSide("b")}
          >
            {playerBName}
          </button>
        </div>
        <div className="text-xl font-bold text-slate-800">{inputScore || "–"}</div>
      </div>

      {/* Remaining scores */}
      <div className="flex gap-2">
        <div
          className={`flex-1 rounded-lg border px-3 py-2 ${
            activeSide === "a" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
          }`}
        >
          <p className="text-xs uppercase font-medium text-emerald-700 truncate">{playerAName}</p>
          <p className="text-3xl font-bold text-emerald-900">{remainingA}</p>
          {activeSide === "a" && finishHintA && (
            <p className="text-xs text-emerald-600 mt-0.5">{finishHintA}</p>
          )}
        </div>
        <div
          className={`flex-1 rounded-lg border px-3 py-2 ${
            activeSide === "b" ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
          }`}
        >
          <p className="text-xs uppercase font-medium text-slate-600 truncate">{playerBName}</p>
          <p className="text-3xl font-bold text-slate-900">{remainingB}</p>
          {activeSide === "b" && finishHintB && (
            <p className="text-xs text-emerald-600 mt-0.5">{finishHintB}</p>
          )}
        </div>
      </div>

      {alert && <div className="text-sm text-red-600 rounded-md bg-red-50 px-3 py-2">{alert}</div>}

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => (
          <button
            key={n}
            className="rounded-md border border-slate-300 bg-white py-4 text-lg font-semibold hover:bg-slate-50 active:bg-slate-100"
            onClick={() => handleKey(n)}
            disabled={pending}
          >
            {n}
          </button>
        ))}
        <button
          className="rounded-md bg-emerald-600 text-white py-3 font-semibold hover:bg-emerald-700 disabled:opacity-50"
          onClick={submitScore}
          disabled={pending}
        >
          Enter
        </button>
        <button
          className="rounded-md bg-slate-100 text-slate-800 py-3 font-semibold hover:bg-slate-200 disabled:opacity-50"
          onClick={clearInput}
          disabled={pending}
        >
          Clear
        </button>
        <button
          className="rounded-md bg-red-50 text-red-700 py-3 font-semibold hover:bg-red-100 disabled:opacity-50"
          onClick={undo}
          disabled={pending}
        >
          Undo
        </button>
      </div>

      {/* Live per-player stats */}
      {meta && (
        <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3">
          {statsA && <StatGrid stats={statsA} name={playerAName} />}
          {statsB && <StatGrid stats={statsB} name={playerBName} />}
        </div>
      )}

      {/* Delete session */}
      <div className="border-t border-slate-100 pt-2">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-600 flex-1">Delete this session?</span>
            <button
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              onClick={deleteSession}
              disabled={pending}
            >
              Yes, delete
            </button>
            <button
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-slate-400"
              onClick={() => setConfirmDelete(false)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            onClick={() => setConfirmDelete(true)}
          >
            Delete session
          </button>
        )}
      </div>
    </div>
  );
}
