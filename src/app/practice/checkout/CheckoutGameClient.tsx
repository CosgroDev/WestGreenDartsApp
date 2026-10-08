"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useScoreTask } from "@/lib/useScoreTask";
import { ScoreSaveStatus } from "@/components/ScoreSaveStatus";
import { canFinishFrom } from "@/lib/scoringUtils";
import { finishRoutes } from "@/lib/finishRoutes";
import {
  loadCheckoutStateAction,
  recordCheckoutAttemptAction,
  endCheckoutGameAction,
  undoCheckoutAction,
} from "./actions";
type Session = {
  revision: number;
  current_target: number;
  status: string;
  player?: { name: string } | null;
};
type Attempt = {
  id: number;
  target: number;
  darts_used: number;
  success: boolean;
};
export default function CheckoutGameClient({
  sessionId,
}: {
  sessionId: string;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [attempts, setAttempts] = useState<Attempt[]>([]),
    [confirmEnd, setConfirmEnd] = useState(false);
  const { pending, error, saved, run, retry, clearError } = useScoreTask();
  const load = useCallback(async () => {
    const r = await loadCheckoutStateAction(sessionId);
    if (!r.ok) throw new Error("Could not load the session.");
    setSession(r.session);
    setAttempts(r.attempts);
  }, [sessionId]);
  useEffect(() => {
    run(load);
  }, [load, run]);
  const reload = () =>
    run(async () => {
      await load();
      clearError();
    });
  const locked = pending || !!error || !session;
  const record = (success: boolean, darts: number) => {
    if (locked || session?.status !== "in_progress") return;
    const request = crypto.randomUUID();
    run(async () => {
      const r = await recordCheckoutAttemptAction(
        sessionId,
        success,
        darts,
        session.revision,
        request,
      );
      if (!r.ok) throw new Error(r.message || "Could not save the attempt.");
      await load();
    });
  };
  const undo = () => {
    if (locked || !session) return;
    const request = crypto.randomUUID();
    run(async () => {
      const r = await undoCheckoutAction(sessionId, session.revision, request);
      if (!r.ok) throw new Error(r.message || "Could not undo.");
      await load();
      setConfirmEnd(false);
    });
  };
  const end = () => {
    if (locked || !session) return;
    const request = crypto.randomUUID();
    run(async () => {
      const r = await endCheckoutGameAction(
        sessionId,
        session.revision,
        request,
      );
      if (!r.ok) throw new Error(r.message || "Could not end the session.");
      await load();
    });
  };
  const status = (
    <ScoreSaveStatus
      pending={pending}
      error={error}
      saved={saved && attempts.length > 0}
      retry={retry}
      reload={reload}
    />
  );
  if (!session)
    return (
      <div className="card">
        <p role="status">Loading checkout practice…</p>
        {status}
      </div>
    );
  const hits = attempts.filter((a) => a.success),
    pct = attempts.length
      ? Math.round((hits.length / attempts.length) * 100)
      : 0;
  const average = hits.length
    ? (hits.reduce((s, a) => s + a.darts_used, 0) / hits.length).toFixed(1)
    : null;
  return (
    <div className="flex flex-col gap-4">
      <header className="card">
        <p className="text-sm text-slate-600">
          Random Checkout · {session.player?.name || "Guest"}
        </p>
        <h1 className="text-2xl font-bold">
          {session.status === "in_progress"
            ? "Checkout practice"
            : "Session results"}
        </h1>
        {status}
      </header>
      {session.status === "in_progress" ? (
        <>
          <section className="card text-center">
            <p className="text-sm text-slate-600">Target</p>
            <p className="text-6xl font-bold text-blue-800">
              {session.current_target}
            </p>
            <p className="mt-3 font-semibold">
              {finishRoutes[session.current_target]}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Finish on a double or Bull.
            </p>
          </section>
          <section className="card">
            <h2 className="font-semibold mb-3">Record the attempt</h2>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  className="btn-primary py-4"
                  disabled={locked || !canFinishFrom(session.current_target, d)}
                  onClick={() => record(true, d)}
                >
                  {d} dart{d > 1 ? "s" : ""}
                </button>
              ))}
            </div>
            <button
              className="btn-secondary w-full mt-2"
              disabled={locked}
              onClick={() => record(false, 0)}
            >
              Didn’t finish · 3 darts
            </button>
          </section>
        </>
      ) : (
        <section className="card text-center">
          <p className="text-4xl font-bold">{pct}% checkout</p>
          <p className="mt-2">
            {hits.length} of {attempts.length} attempts finished
            {average && ` · ${average} average darts`}
          </p>
        </section>
      )}
      <section className="card flex flex-col gap-2">
        <button
          className="btn-secondary"
          disabled={
            locked || (!attempts.length && session.status === "in_progress")
          }
          onClick={undo}
        >
          {session.status === "in_progress"
            ? "Undo last attempt"
            : "Undo final action"}
        </button>
        {session.status === "in_progress" ? (
          <>
            {confirmEnd ? (
              <div>
                <p className="text-sm mb-2">
                  End this session and keep its results?
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-primary"
                    disabled={locked}
                    onClick={end}
                  >
                    End &amp; results
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={locked}
                    onClick={() => setConfirmEnd(false)}
                  >
                    Keep playing
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn-secondary"
                disabled={locked}
                onClick={() => setConfirmEnd(true)}
              >
                End &amp; results
              </button>
            )}
            <Link
              aria-disabled={locked}
              onClick={(e) => {
                if (locked) e.preventDefault();
              }}
              className="btn-secondary text-center"
              href="/practice"
            >
              Pause &amp; save
            </Link>
            <p className="text-xs text-slate-600">
              Each recorded attempt is saved. Resume from Practice.
            </p>
          </>
        ) : (
          <>
            <Link className="btn-primary text-center" href="/practice/checkout">
              Play again
            </Link>
            <Link className="btn-secondary text-center" href="/practice">
              Back to Practice
            </Link>
          </>
        )}
      </section>
      <details className="card">
        <summary>Attempt history · {attempts.length}</summary>
        <ol className="mt-3 divide-y divide-slate-200">
          {attempts.map((a) => (
            <li key={a.id} className="py-2 flex justify-between gap-2">
              <span>{a.target} target</span>
              <span>
                {a.success
                  ? `${a.darts_used} darts · finished`
                  : "Not finished"}
              </span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
