"use client";

import { useMemo, useState } from "react";
import { startDoublesGameAction } from "./actions";

type PlayerOption = { id: string; name: string };

export default function DoublesStartForm({ players }: { players: PlayerOption[] }) {
  const [order, setOrder] = useState<string[]>([]);
  const [pick, setPick] = useState("");

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
    <form action={startDoublesGameAction} className="flex flex-col gap-3">
      <input type="hidden" name="playerOrder" value={order.join(",")} />

      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-700" htmlFor="doublesPick">
          Add players (in throwing order)
        </label>
        <div className="flex gap-2">
          <select
            id="doublesPick"
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2"
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
            className="rounded-md bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-40"
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
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <span className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                  {i + 1}
                </span>
                <span className="font-semibold">{nameById.get(id)}</span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-30"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-30"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(id)}
                  className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-600"
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

      <button
        type="submit"
        disabled={order.length === 0}
        className="rounded-md bg-emerald-600 px-4 py-3 font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
      >
        Start Doubles Switch
      </button>
    </form>
  );
}
