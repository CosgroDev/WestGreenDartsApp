"use client";

import { useRef } from "react";
import { useFormState } from "react-dom";
import { createGameAction } from "./actions";

type Props = { fixtureId: string; disable: boolean; players: { id: string; name: string }[] };

const initialState = { ok: false, message: "" };

export function CreateGameForm({ fixtureId, disable, players }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(createGameAction, initialState);

  if (state.ok && formRef.current) {
    const opp = formRef.current.elements.namedItem("opponent") as HTMLInputElement | null;
    if (opp) opp.value = "";
  }

  return (
    <form action={formAction} className="flex flex-col gap-3" method="post" ref={formRef}>
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-700" htmlFor="playerId">
            West Green player
          </label>
          <select
            id="playerId"
            name="playerId"
            className="rounded-md border border-slate-300 px-3 py-2"
            defaultValue=""
            disabled={disable}
            required
          >
            <option value="">Select player</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-slate-700" htmlFor="opponent">
            Opponent player
          </label>
          <input
            id="opponent"
            name="opponent"
            type="text"
            required
            className="rounded-md border border-slate-300 px-3 py-2"
            placeholder="Opponent name"
            disabled={disable}
          />
        </div>
      </div>

      {state.message && !state.ok && <p className="text-sm text-red-600">{state.message}</p>}

      <button
        type="submit"
        disabled={disable}
        className="self-start rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700 disabled:opacity-60"
      >
        Create game
      </button>
    </form>
  );
}
