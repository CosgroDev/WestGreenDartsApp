"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { createFixtureAction } from "./actions";

type SeasonOption = { id: string; name: string; is_current?: boolean };

const initialState = { ok: false, message: "" as string | undefined };

export function CreateFixtureForm({ seasons, defaultSeasonId }: { seasons: SeasonOption[]; defaultSeasonId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(createFixtureAction, initialState);

  useEffect(() => {
    if (state?.ok) {
      const form = formRef.current;
      if (!form) return;
      const seasonEl = form.elements.namedItem("seasonId") as HTMLSelectElement | null;
      const seasonValue = seasonEl?.value;

      form.reset();

      // restore season selection
      if (seasonEl && seasonValue) seasonEl.value = seasonValue;
      // reset startsAt to "now"
      const startsAtEl = form.elements.namedItem("startsAt") as HTMLInputElement | null;
      if (startsAtEl) startsAtEl.value = new Date().toISOString().slice(0, 16);
    }
  }, [state?.ok]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-700" htmlFor="season">
          Season
        </label>
        <select
          id="season"
          name="seasonId"
          className="rounded-md border border-slate-300 px-3 py-2"
          defaultValue={defaultSeasonId}
          required
        >
          <option value="" disabled>
            Select season
          </option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.is_current ? "(current)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-700" htmlFor="startsAt">
          Date & time
        </label>
        <input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={new Date().toISOString().slice(0, 16)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="home" className="h-4 w-4" />
        Home fixture
      </label>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-700" htmlFor="opponent">
          Opponent
        </label>
        <input
          id="opponent"
          name="opponent"
          type="text"
          required
          className="rounded-md border border-slate-300 px-3 py-2"
          placeholder="Opponent team name"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-700" htmlFor="venue">
          Venue (optional)
        </label>
        <input
          id="venue"
          name="venue"
          type="text"
          className="rounded-md border border-slate-300 px-3 py-2"
          placeholder="Venue"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm text-slate-700" htmlFor="notes">
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          className="rounded-md border border-slate-300 px-3 py-2"
          rows={2}
          placeholder="Any extra info"
        />
      </div>

      {state?.message && !state.ok && <p className="text-sm text-red-600">{state.message}</p>}
      {state?.ok && <p className="text-sm text-emerald-700">Fixture saved</p>}

      <button
        type="submit"
        className="self-start rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700"
      >
        Save fixture
      </button>
    </form>
  );
}
