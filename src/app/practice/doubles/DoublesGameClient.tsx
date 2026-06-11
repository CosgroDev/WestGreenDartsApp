"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DOUBLES_SEQUENCE } from "@/lib/doublesPractice";
import {
  loadDoublesStateAction,
  recordDoublesAttemptAction,
  endDoublesGameAction,
  abandonDoublesSessionAction,
} from "./actions";

type PlayerRow = {
  id: string;
  throw_order: number;
  round_index: number;
  current_target: number;
  phase: string;
  score: number;
  hits: number;
  first_dart_hits: number;
  player?: { name: string } | null;
};

type Attempt = {
  id: number;
  session_player_id: string;
  target: number;
  dart_hit: number;
  points: number;
};

type Session = {
  current_slot: number;
  status: string;
};

export default function DoublesGameClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  // How many darts have been thrown-and-missed this visit (0..2 → next dart index).
  const [dartIndex, setDartIndex] = useState(0);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [pending, startTransition] = useTransition();

  const loadState = () => {
    startTransition(async () => {
      const res = await loadDoublesStateAction(sessionId);
      if (res.ok) {
        setSession(res.session as Session);
        setPlayers(res.players as PlayerRow[]);
        setAttempts(res.attempts as Attempt[]);
      }
    });
  };

  useEffect(() => {
    loadState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const submit = (dartHit: number) => {
    if (!session || session.status !== "in_progress" || pending) return;
    setDartIndex(0);
    startTransition(async () => {
      const res = await recordDoublesAttemptAction(sessionId, dartHit);
      if (!res?.ok) return;
      const reload = await loadDoublesStateAction(sessionId);
      if (reload.ok) {
        setSession(reload.session as Session);
        setPlayers(reload.players as PlayerRow[]);
        setAttempts(reload.attempts as Attempt[]);
      }
    });
  };

  const onHit = () => submit(dartIndex + 1);
  const onMiss = () => {
    if (dartIndex >= 2) {
      submit(0); // missed all three
    } else {
      setDartIndex((i) => i + 1);
    }
  };

  const endGame = () => {
    startTransition(async () => {
      await endDoublesGameAction(sessionId);
      loadState();
    });
  };

  const quit = () => {
    startTransition(async () => {
      await abandonDoublesSessionAction(sessionId);
      router.push("/practice/doubles");
    });
  };

  const nameOf = (p: PlayerRow) => p.player?.name ?? "Player";
  const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

  if (!session) {
    return <div className="card text-sm text-slate-600">Loading…</div>;
  }

  // ── Results screen ──────────────────────────────────────────────
  if (session.status !== "in_progress") {
    const ranked = [...players].sort((a, b) => b.score - a.score);
    const top = ranked[0]?.score ?? 0;
    const winners = ranked.filter((p) => p.score === top && top > 0);
    return (
      <div className="flex flex-col gap-4">
        <div className="card text-center py-6">
          <p className="text-5xl mb-3">🏆</p>
          <h2 className="text-2xl font-bold text-emerald-700">
            {winners.length === 1
              ? `${nameOf(winners[0])} wins!`
              : winners.length > 1
              ? `Tie: ${winners.map(nameOf).join(" & ")}`
              : "Game over"}
          </h2>
          <p className="text-slate-500 mt-1">Doubles Switch · final standings</p>
        </div>

        <div className="card">
          <div className="flex flex-col gap-1.5">
            {ranked.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-md border px-3 py-2.5 text-sm ${
                  p.score === top && top > 0 ? "border-emerald-300 bg-emerald-50" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-slate-400 font-semibold w-5 text-center">{i + 1}</span>
                  <div>
                    <p className="font-semibold">{nameOf(p)}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Doubles {pct(p.hits, p.round_index)}% · 1st dart {pct(p.first_dart_hits, p.round_index)}% ·{" "}
                      {p.round_index} thrown
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-800 text-white px-3 py-1 text-sm font-bold">
                  {p.score}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card flex flex-col gap-2">
          <a
            href="/practice/doubles"
            className="rounded-md bg-emerald-600 px-4 py-3 text-center text-white font-semibold hover:bg-emerald-700"
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

  // ── In-progress screen ──────────────────────────────────────────
  const slot = players.length ? ((session.current_slot % players.length) + players.length) % players.length : 0;
  const active = players[slot];
  const ranked = [...players].sort((a, b) => b.score - a.score);

  if (!active) {
    return <div className="card text-sm text-slate-600">No players in this game.</div>;
  }

  const phaseLabel =
    active.phase === "sequence"
      ? `In order · ${active.round_index + 1}/${DOUBLES_SEQUENCE.length}`
      : "Random";

  return (
    <div className="card flex flex-col gap-3">
      {/* Header / end game */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div>
          <p className="text-xs text-slate-500">Doubles Switch</p>
          <p className="text-sm font-semibold text-slate-800">{players.length} players</p>
        </div>
        {confirmEnd ? (
          <div className="flex items-center gap-2">
            <button
              onClick={endGame}
              disabled={pending}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              End & show winner
            </button>
            <button
              onClick={quit}
              disabled={pending}
              className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Quit
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

      {/* Active player + target */}
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-4 text-center">
        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">
          {nameOf(active)}&apos;s throw
        </p>
        <p className="text-5xl font-extrabold text-emerald-800 mt-1">D{active.current_target}</p>
        <p className="text-xs text-emerald-500 mt-1">{phaseLabel}</p>
      </div>

      {/* Dart slots */}
      <div>
        <p className="text-xs text-slate-500 mb-1.5">Tap the dart that hits, or Miss</p>
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => {
            const state = i < dartIndex ? "miss" : i === dartIndex ? "active" : "idle";
            return (
              <div
                key={i}
                className={`rounded-md border py-2 text-center text-xs font-semibold ${
                  state === "miss"
                    ? "border-red-200 bg-red-50 text-red-500"
                    : state === "active"
                    ? "border-emerald-400 bg-white text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-400"
                }`}
              >
                Dart {i + 1}
                <div className="text-[11px] font-normal">
                  {state === "miss" ? "missed" : state === "active" ? "throwing" : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Hit / Miss */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onHit}
          disabled={pending}
          className="rounded-md bg-emerald-600 py-4 text-lg font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Hit ✓
        </button>
        <button
          onClick={onMiss}
          disabled={pending}
          className="rounded-md border border-slate-300 bg-white py-4 text-lg font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {dartIndex >= 2 ? "Miss (all 3)" : "Miss"}
        </button>
      </div>

      {/* Live scoreboard */}
      <div className="border-t border-slate-100 pt-2">
        <p className="text-xs font-semibold text-slate-500 mb-1.5">Scoreboard</p>
        <div className="flex flex-col gap-1">
          {ranked.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs ${
                p.id === active.id ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50"
              }`}
            >
              <span className="font-semibold text-slate-700">
                {nameOf(p)} {p.id === active.id && <span className="text-emerald-600">● to throw</span>}
              </span>
              <span className="flex items-center gap-2 text-slate-500">
                <span>D{p.current_target}</span>
                <span>{pct(p.hits, p.round_index)}%</span>
                <span className="rounded-full bg-slate-800 text-white px-2 py-0.5 font-bold">{p.score}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent attempts */}
      {attempts.length > 0 && (
        <div className="border-t border-slate-100 pt-2">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Recent</p>
          <div className="flex flex-col gap-1">
            {attempts.slice(0, 6).map((a) => {
              const who = players.find((p) => p.id === a.session_player_id);
              return (
                <div key={a.id} className="flex items-center justify-between text-xs text-slate-600 py-0.5">
                  <span>
                    {who ? nameOf(who) : "Player"} · D{a.target}
                  </span>
                  {a.dart_hit > 0 ? (
                    <span className="text-emerald-700 font-semibold">
                      {a.dart_hit === 1 ? "1st" : a.dart_hit === 2 ? "2nd" : "3rd"} dart ✓ (+{a.points})
                    </span>
                  ) : (
                    <span className="text-red-500">missed ✗</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
