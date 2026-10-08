"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useScoreTask } from "@/lib/useScoreTask";
import { ScoreSaveStatus } from "@/components/ScoreSaveStatus";
import {
  loadDoublesStateAction,
  recordDoublesAttemptAction,
  endDoublesGameAction,
  undoDoublesAction,
} from "./actions";
type Player = {
  id: string;
  round_index: number;
  current_target: number;
  phase: string;
  score: number;
  hits: number;
  first_dart_hits: number;
  player?: { name: string } | null;
};
type Session = {
  revision: number;
  current_slot: number;
  status: string;
  end_after_round: boolean;
};
type Attempt = {
  id: number;
  session_player_id: string;
  target: number;
  dart_hit: number;
  points: number;
};
export default function DoublesGameClient({
  sessionId,
}: {
  sessionId: string;
}) {
  const [session, setSession] = useState<Session | null>(null),
    [players, setPlayers] = useState<Player[]>([]),
    [attempts, setAttempts] = useState<Attempt[]>([]),
    [confirmEnd, setConfirmEnd] = useState(false);
  const { pending, error, saved, run, retry, clearError } = useScoreTask();
  const load = useCallback(async () => {
    const r = await loadDoublesStateAction(sessionId);
    if (!r.ok) throw new Error("Could not load this session.");
    setSession(r.session);
    setPlayers(r.players);
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
  const submit = (dart: number) => {
    if (locked || session?.status !== "in_progress") return;
    const request = crypto.randomUUID();
    run(async () => {
      const r = await recordDoublesAttemptAction(
        sessionId,
        dart,
        session.revision,
        request,
      );
      if (!r.ok)
        throw new Error(
          "message" in r ? r.message : "Could not save the visit.",
        );
      await load();
    });
  };
  const undo = () => {
    if (locked || !session) return;
    const request = crypto.randomUUID();
    run(async () => {
      const r = await undoDoublesAction(sessionId, session.revision, request);
      if (!r.ok) throw new Error(r.message || "Could not undo.");
      await load();
      setConfirmEnd(false);
    });
  };
  const end = (immediate = false) => {
    if (locked || !session) return;
    const request = crypto.randomUUID();
    run(async () => {
      const r = await endDoublesGameAction(
        sessionId,
        session.revision,
        request,
        immediate,
      );
      if (!r.ok) throw new Error(r.message || "Could not end the game.");
      await load();
      setConfirmEnd(false);
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
      <section className="card">
        <p role="status">Loading doubles practice…</p>
        {status}
      </section>
    );
  const name = (p: Player) => p.player?.name || "Player",
    pct = (p: Player) =>
      p.round_index ? Math.round((p.hits / p.round_index) * 100) : 0;
  const active = players[session.current_slot % players.length],
    ranked = [...players].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score || 0,
    winners = ranked.filter((p) => p.score === top);
  return (
    <div className="flex flex-col gap-4">
      <header className="card">
        <p className="text-sm text-slate-600">
          Doubles Switch · {players.length} players
        </p>
        <h1 className="text-2xl font-bold">
          {session.status === "in_progress"
            ? "Doubles practice"
            : "Session results"}
        </h1>
        {status}
      </header>
      {session.status === "in_progress" && active ? (
        <>
          <section className="card text-center">
            <p className="font-semibold break-words">{name(active)}’s visit</p>
            <p className="text-6xl font-bold text-emerald-800 mt-2">
              D{active.current_target}
            </p>
            <p className="text-sm text-slate-600 mt-2">
              {active.phase === "sequence"
                ? `In order · ${active.round_index + 1} of 20`
                : "Random target"}
            </p>
            {session.end_after_round && (
              <p role="status" className="mt-3 font-semibold">
                Finishing this round so everyone gets equal visits.
              </p>
            )}
          </section>
          <section className="card">
            <h2 className="font-semibold">Which dart hit the double?</h2>
            <p className="text-sm text-slate-600 mb-3">
              Record the first hit. A hit ends the visit.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((d) => (
                <button
                  key={d}
                  className="btn-primary py-4"
                  disabled={locked}
                  onClick={() => submit(d)}
                >
                  {d === 1 ? "1st" : d === 2 ? "2nd" : "3rd"} dart
                </button>
              ))}
            </div>
            <button
              className="btn-secondary w-full mt-2"
              disabled={locked}
              onClick={() => submit(0)}
            >
              All 3 missed
            </button>
          </section>
        </>
      ) : (
        <section className="card text-center">
          <h2 className="text-2xl font-semibold break-words">
            {top === 0
              ? "No scoring hits"
              : winners.length === 1
                ? `${name(winners[0])} wins`
                : `Tie: ${winners.map(name).join(" & ")}`}
          </h2>
          {new Set(players.map((p) => p.round_index)).size > 1 && (
            <p className="mt-2 text-amber-800">
              Ended with unequal visits. Compare scores with care.
            </p>
          )}
        </section>
      )}
      <section className="card">
        <h2 className="font-semibold mb-3">
          {session.status === "in_progress" ? "Scoreboard" : "Final standings"}
        </h2>
        <ol className="divide-y divide-slate-200">
          {ranked.map((p, i) => (
            <li key={p.id} className="py-3 flex justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold break-words">
                  {i + 1}. {name(p)}{" "}
                  {p.id === active?.id && session.status === "in_progress"
                    ? "· throwing"
                    : ""}
                </p>
                <p className="text-xs text-slate-600">
                  {p.round_index} visits · {pct(p)}% hits · {p.first_dart_hits}{" "}
                  first-dart hits
                </p>
              </div>
              <strong>{p.score}</strong>
            </li>
          ))}
        </ol>
      </section>
      <section className="card flex flex-col gap-2">
        <button
          className="btn-secondary"
          disabled={
            locked ||
            (!attempts.length &&
              session.status === "in_progress" &&
              !session.end_after_round)
          }
          onClick={undo}
        >
          {session.status === "in_progress"
            ? "Undo last action"
            : "Undo final action"}
        </button>
        {session.status === "in_progress" ? (
          <>
            {confirmEnd ? (
              <div>
                <p className="text-sm mb-2">
                  Finish the current round so each player gets the same number
                  of visits?
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    className="btn-primary"
                    disabled={locked}
                    onClick={() => end()}
                  >
                    Finish round &amp; results
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={locked}
                    onClick={() => end(true)}
                  >
                    End now · unequal visits possible
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
                disabled={locked || session.end_after_round}
                onClick={() => setConfirmEnd(true)}
              >
                End &amp; results
              </button>
            )}
            <Link
              className="btn-secondary text-center"
              href="/practice"
              aria-disabled={locked}
              onClick={(e) => {
                if (locked) e.preventDefault();
              }}
            >
              Pause &amp; save
            </Link>
            <p className="text-xs text-slate-600">
              Every recorded visit is saved. Resume from Practice.
            </p>
          </>
        ) : (
          <>
            <Link className="btn-primary text-center" href="/practice/doubles">
              Play again
            </Link>
            <Link className="btn-secondary text-center" href="/practice">
              Back to Practice
            </Link>
          </>
        )}
      </section>
      <details className="card">
        <summary>Visit history · {attempts.length}</summary>
        <ol className="mt-3 divide-y divide-slate-200">
          {attempts.map((a) => (
            <li key={a.id} className="py-2 text-sm">
              {name(
                players.find((p) => p.id === a.session_player_id) ||
                  ({} as Player),
              )}{" "}
              · D{a.target}:{" "}
              {a.dart_hit
                ? `dart ${a.dart_hit} hit (+${a.points})`
                : "all missed"}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
