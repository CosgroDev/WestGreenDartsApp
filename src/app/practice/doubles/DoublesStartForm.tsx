"use client";

import { useMemo, useState, useTransition } from "react";
import { startDoublesGameAction } from "./actions";

type PlayerOption = { id: string; name: string };

export default function DoublesStartForm({ players }: { players: PlayerOption[] }) {
  const [order, setOrder] = useState<string[]>([]);
  const [pick, setPick] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const nameById = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);
  const available = players.filter((p) => !order.includes(p.id));

  const add = () => {
    if (!pick || order.includes(pick)) return;
    setOrder((o) => [...o, pick]);
    setPick("");
  };
  const remove = (id: string) => setOrder((o) => o.filter((x) => x !== id));
  const move = (index: number, dir: -1 | 1) => {
    setOrder((o) => {
      const next = [...o];
      const target = index + dir;
      if (target < 0 || target >= next.length) return o;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  return (
    <form onSubmit={event => {
      event.preventDefault();
      if (pending) return;
      const data = new FormData(event.currentTarget);
      setError("");
      startTransition(async () => {
        try {
          const result = await startDoublesGameAction(data);
          if (result && !result.ok) setError(result.message ?? "Could not start this game. Please try again.");
        } catch (failure) {
          if (failure instanceof Error && failure.message.includes("NEXT_REDIRECT")) throw failure;
          setError("Could not connect to start the game. Your throwing order is unchanged; please try again.");
        }
      });
    }} className="flex min-w-0 flex-col gap-3">
      <fieldset disabled={pending} className="flex min-w-0 flex-col gap-3">
      <input type="hidden" name="playerOrder" value={order.join(",")} />

      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-700" htmlFor="doublesPick">
          Add players (in throwing order)
        </label>
        <div className="flex min-w-0 gap-2">
          <select
            id="doublesPick"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="input min-w-0 flex-1"
          >
            <option value="">-- Select player --</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={!pick}
            className="btn btn-secondary shrink-0"
          >
            Add
          </button>
        </div>
      </div>

      {order.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {order.map((id, i) => (
            <li
              key={id}
              className="flex min-w-0 flex-col gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {i + 1}
                </span>
                <span className="min-w-0 break-words font-semibold">{nameById.get(id)}</span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="btn btn-secondary"
                  aria-label={`Move ${nameById.get(id)} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  className="btn btn-secondary"
                  aria-label={`Move ${nameById.get(id)} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="btn btn-secondary"
                  aria-label={`Remove ${nameById.get(id)} from this game`}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-slate-500">Add at least one player to start.</p>
      )}

      </fieldset>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={order.length === 0 || pending}
        aria-busy={pending}
        className="btn btn-primary"
      >
        {pending ? "Starting…" : "Start Doubles Switch"}
      </button>
    </form>
  );
}
