"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { finishRoutes } from "@/lib/finishRoutes";
import {
  loadCheckoutStateAction,
  recordCheckoutAttemptAction,
  endCheckoutGameAction,
} from "./actions";

type Attempt = {
  id: number;
  target: number;
  darts_used: number;
  success: boolean;
};

type Session = {
  current_target: number;
  attempt_index: number;
  status: string;
  player?: { name: string } | null;
};

export default function CheckoutGameClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadState = () => {
    startTransition(async () => {
      const res = await loadCheckoutStateAction(sessionId);
      if (res.ok) {
        setSession(res.session as Session);
        setAttempts(res.attempts as Attempt[]);
      }
    });
  };

  useEffect(() => {
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const record = (success: boolean, dartsUsed: number) => {
    if (!session || session.status !== "in_progress" || pending) return;
    startTransition(async () => {
      const res = await recordCheckoutAttemptAction(sessionId, success, dartsUsed);
      if (!res?.ok) return;
      loadState();
    });
  };

  const endGame = () => {
    startTransition(async () => {
      await endCheckoutGameAction(sessionId);
      loadState();
    });
  };

  const finished = attempts.filter((a) => a.success).length;
  const successDarts = attempts.filter((a) => a.success);
  const avgDarts = useMemo(
    () =>
      successDarts.length
        ? Math.round((successDarts.reduce((s, a) => s + a.darts_used, 0) / successDarts.length) * 10) / 10
        : null,
    [successDarts]
  );

  if (!session) {
    return <div className="card text-sm text-slate-600">Loading…</div>;
  }

  const playerName = session.player?.name ?? "Player";

  // ── Results screen ──────────────────────────────────────────────
  if (session.status !== "in_progress") {
    const pct = attempts.length ? Math.round((finished / attempts.length) * 100) : 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="card text-center py-6">
          <p className="text-5xl mb-3">🎯</p>
          <h2 className="text-2xl font-bold text-blue-700">{pct}% checkout</h2>
          <p className="text-slate-500 mt-1">
            {playerName} · {finished}/{attempts.length} finished
            {avgDarts !== null && ` · ${avgDarts} avg darts`}
          </p>
        </div>
        <div className="card flex flex-col gap-2">
          <a
            href="/practice/checkout"
            className="rounded-md bg-blue-600 px-4 py-3 text-center text-white font-semibold hover:bg-blue-700"
          >
            Play again
          </a>
          <a
            href="/practice"
            className="rounded-md border border-slate-300 px-4 py-2 text-center text-sm text-slate-700 hover:border-slate-400"
          >
            Back to Practice
          </a>
        </div>
      </div>
    );
  }

  const route = finishRoutes[session.current_target];

  // ── In-progress screen ──────────────────────────────────────────
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div>
          <p className="text-xs text-slate-500">Random Checkout</p>
          <p className="text-sm font-semibold text-slate-800">{playerName}</p>
        </div>
        {confirmEnd ? (
          <div className="flex items-center gap-2">
            <button
              onClick={endGame}
              disabled={pending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              End & see stats
            </button>
            <button
              onClick={() => setConfirmEnd(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmEnd(true)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400"
          >
            End game
          </button>
        )}
      </div>

      {/* Target */}
      <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-5 text-center">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">Checkout</p>
        <p className="text-6xl font-extrabold text-blue-800 mt-1">{session.current_target}</p>
        {route && <p className="text-sm font-semibold text-blue-500 mt-2">{route}</p>}
      </div>

      {/* Running stats */}
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Finished: <strong className="text-slate-700">{finished}/{attempts.length}</strong></span>
        {avgDarts !== null && <span>Avg darts: <strong className="text-slate-700">{avgDarts}</strong></span>}
      </div>

      {/* Outcome buttons */}
      <div>
        <p className="text-xs text-slate-500 mb-1.5">Finished in…</p>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              onClick={() => record(true, d)}
              disabled={pending}
              className="rounded-md bg-blue-600 py-4 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {d} dart{d > 1 ? "s" : ""}
            </button>
          ))}
        </div>
        <button
          onClick={() => record(false, 0)}
          disabled={pending}
          className="mt-2 w-full rounded-md border border-slate-300 bg-white py-3 font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          Didn&apos;t finish
        </button>
      </div>

      {/* Recent attempts */}
      {attempts.length > 0 && (
        <div className="border-t border-slate-100 pt-2">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Recent</p>
          <div className="flex flex-col gap-1">
            {attempts.slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center justify-between text-xs text-slate-600 py-0.5">
                <span>Checkout {a.target}</span>
                {a.success ? (
                  <span className="text-emerald-700 font-semibold">
                    ✓ {a.darts_used} dart{a.darts_used > 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-red-500">✗ missed</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
