"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { load121StateAction, record121TurnAction, abandon121SessionAction } from "./actions";
import { Button } from "@/components/ui/button";

type Turn = {
  id: number;
  checkout: number;
  turn_number: number;
  score: number;
  remaining_before: number;
  remaining_after: number;
  is_bust: boolean;
  result: string | null;
};

type Session = {
  base_checkout: number;
  current_checkout: number;
  current_turn: number;
  remaining: number;
  status: string;
  player?: { name: string } | null;
};

export default function Game121Client({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [inputScore, setInputScore] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [lastBase, setLastBase] = useState<number | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadState = () => {
    startTransition(async () => {
      const res = await load121StateAction(sessionId);
      if (res.ok) {
        setSession(res.session as Session);
        setTurns((res.turns as Turn[]) ?? []);
      }
    });
  };

  useEffect(() => {
    loadState();
  }, [sessionId]);

  const handleKey = (n: number) => {
    setInputScore((prev) => {
      const next = Number(`${prev}${n}`);
      return next > 180 ? prev : next;
    });
  };

  const submitWithScore = (score: number) => {
    if (!session || session.status !== "in_progress") return;
    setInputScore(0);
    startTransition(async () => {
      const res = await record121TurnAction(sessionId, score);
      if (!res?.ok) return;
      setLastResult(res.result ?? null);
      const reload = await load121StateAction(sessionId);
      if (reload.ok) {
        setLastBase((reload.session as Session).base_checkout);
        setSession(reload.session as Session);
        setTurns((reload.turns as Turn[]) ?? []);
      }
    });
  };

  const abandon = () => {
    startTransition(async () => {
      await abandon121SessionAction(sessionId);
      router.push("/practice/121");
    });
  };

  if (!session) {
    return <div className="card text-sm text-slate-600">Loading…</div>;
  }

  const playerName = (session as any).player?.name ?? "Player";

  // ── Win screen ─────────────────────────────────────────────────
  if (session.status === "won") {
    const totalTurns = turns.length;
    return (
      <div className="flex flex-col gap-4">
        <div className="card text-center py-6">
          <p className="text-5xl mb-3">🎯</p>
          <h2 className="text-2xl font-bold text-emerald-700">You reached 170!</h2>
          <p className="text-slate-600 mt-1">{playerName} completed the 121 challenge</p>
          <p className="text-sm text-slate-400 mt-1">in {totalTurns} turn{totalTurns !== 1 ? "s" : ""}</p>
        </div>

        {/* Recent turns on win screen */}
        {turns.length > 0 && (
          <div className="card">
            <p className="text-xs font-semibold text-slate-500 mb-2">Turn history</p>
            <div className="flex flex-col gap-1">
              {turns.slice(0, 10).map((t) => (
                <TurnRow key={t.id} turn={t} />
              ))}
            </div>
          </div>
        )}

        <div className="card flex flex-col gap-2">
          <Button size="lg" className="bg-purple-600 hover:bg-purple-700 text-white" asChild>
            <a href="/practice/121">Play again</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/practice">Back to Practice</a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/dashboard">Dashboard</a>
          </Button>
        </div>
      </div>
    );
  }

  // ── Result banner ───────────────────────────────────────────────
  const resultBanner =
    lastResult === "locked"
      ? { text: `🔒 Locked! Base is now ${lastBase ?? session.base_checkout}`, cls: "bg-purple-50 text-purple-700 border-purple-200" }
      : lastResult === "progressed"
      ? { text: "✓ Checkout complete! Next up…", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
      : lastResult === "failed"
      ? { text: `✗ Failed — back to base ${session.base_checkout}`, cls: "bg-red-50 text-red-700 border-red-200" }
      : null;

  // Progress bar: how far from 121 to 170
  const progress = Math.round(((session.current_checkout - 121) / (170 - 121)) * 100);

  // ── In-progress game screen ─────────────────────────────────────
  return (
    <div className="card flex flex-col gap-3">
      {/* Nav — no links away from game; must use End game to exit */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div>
          <p className="text-xs text-slate-500">121 Challenge</p>
          <p className="text-sm font-semibold text-slate-800">{playerName}</p>
        </div>
        {confirmAbandon ? (
          <div className="flex items-center gap-2">
            <Button
              onClick={abandon}
              disabled={pending}
              size="sm"
              className="bg-slate-700 hover:bg-slate-800 text-white"
            >
              Yes, end game
            </Button>
            <Button
              onClick={() => setConfirmAbandon(false)}
              variant="outline"
              size="sm"
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            onClick={() => setConfirmAbandon(true)}
            variant="outline"
            size="sm"
          >
            End game
          </Button>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>121</span>
          <span className="font-semibold text-slate-700">
            Checkout {session.current_checkout} / 170
          </span>
          <span>170</span>
        </div>
        <div className="h-2 w-full rounded-full bg-slate-100">
          <div
            className="h-2 rounded-full bg-purple-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Game state */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-2">
          <p className="text-xs text-slate-500">Base</p>
          <p className="text-xl font-bold text-slate-800">{session.base_checkout}</p>
          <p className="text-xs text-slate-400">🔒 locked</p>
        </div>
        <div className="rounded-lg bg-purple-50 border border-purple-200 px-2 py-2">
          <p className="text-xs text-purple-600">Remaining</p>
          <p className="text-3xl font-bold text-purple-800">{session.remaining}</p>
          <p className="text-xs text-purple-400">checkout {session.current_checkout}</p>
        </div>
        <div className="rounded-lg bg-slate-50 border border-slate-200 px-2 py-2">
          <p className="text-xs text-slate-500">Turn</p>
          <p className="text-xl font-bold text-slate-800">{session.current_turn}</p>
          <p className="text-xs text-slate-400">of 3</p>
        </div>
      </div>

      {/* Result banner */}
      {resultBanner && (
        <div className={`rounded-md border px-3 py-2 text-sm font-semibold ${resultBanner.cls}`}>
          {resultBanner.text}
        </div>
      )}

      {/* Score input display */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">Turn {session.current_turn} score:</span>
        <span className="text-2xl font-bold text-slate-800">{inputScore || "–"}</span>
      </div>

      {/* Numpad */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <Button
            key={n}
            onClick={() => handleKey(n)}
            disabled={pending}
            variant="outline"
            className="py-4 h-auto text-lg"
          >
            {n}
          </Button>
        ))}
        <Button
          onClick={() => submitWithScore(0)}
          disabled={pending}
          variant="outline"
          className="py-3 h-auto text-sm text-slate-600"
        >
          Miss
        </Button>
        <Button
          onClick={() => handleKey(0)}
          disabled={pending}
          variant="outline"
          className="py-4 h-auto text-lg"
        >
          0
        </Button>
        <Button
          onClick={() => setInputScore(0)}
          disabled={pending}
          variant="secondary"
          className="py-3 h-auto"
        >
          Clear
        </Button>
        <Button
          onClick={() => submitWithScore(inputScore)}
          disabled={pending}
          className="col-span-3 bg-purple-600 hover:bg-purple-700 text-white py-3 h-auto"
        >
          Enter
        </Button>
      </div>

      {/* Recent turns */}
      {turns.length > 0 && (
        <div className="border-t border-slate-100 pt-2">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Recent turns</p>
          <div className="flex flex-col gap-1">
            {turns.slice(0, 6).map((t) => (
              <TurnRow key={t.id} turn={t} />
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function TurnRow({ turn }: { turn: Turn }) {
  const resultLabel =
    turn.result === "locked"
      ? <span className="text-purple-700 font-semibold">🔒 Locked</span>
      : turn.result === "progressed"
      ? <span className="text-emerald-700 font-semibold">✓ Done</span>
      : turn.result === "failed"
      ? <span className="text-red-600 font-semibold">✗ Failed</span>
      : turn.result === "won"
      ? <span className="text-emerald-700 font-bold">🏆 Won!</span>
      : <span className="text-slate-400">{turn.remaining_after} left</span>;

  return (
    <div className="flex items-center justify-between text-xs text-slate-600 py-0.5">
      <span>
        C{turn.checkout} · T{turn.turn_number} ·{" "}
        {turn.is_bust ? (
          <span className="text-red-500">Bust ({turn.score})</span>
        ) : (
          <span>{turn.score}</span>
        )}
      </span>
      {resultLabel}
    </div>
  );
}
