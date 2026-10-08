"use client";

import { useRef } from "react";
import { ActionForm, PendingButton } from "@/components/ActionForm";
import { createFixtureAction } from "./actions";

type SeasonOption = { id: string; name: string; is_current?: boolean };

export function CreateFixtureForm({ seasons, defaultSeasonId }: { seasons: SeasonOption[]; defaultSeasonId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const requestRef = useRef<HTMLInputElement>(null);
  return (
    <ActionForm action={async data => {
      const requestInput = requestRef.current;
      if (!requestInput) return { ok: false, message: "Unable to save. Refresh and try again" };
      if (!requestInput.value) requestInput.value = crypto.randomUUID();
      data.set("fixtureRequest", requestInput.value);
      const result = await createFixtureAction({ ok: false }, data);
      if (result.ok && formRef.current) {
        const season = formRef.current.elements.namedItem("seasonId") as HTMLSelectElement | null;
        const selected = season?.value;
        formRef.current.reset();
        requestInput.value = "";
        if (season && selected) season.value = selected;
      }
      return result;
    }} className="grid grid-cols-1 gap-3" successMessage="Fixture saved.">
      <input ref={requestRef} type="hidden" name="fixtureRequest" defaultValue="" />
      <div className="contents" ref={node => { formRef.current = node?.closest("form") ?? null; }}>
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
          Date & time (UK)
        </label>
        <input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          required
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

      <PendingButton className="btn-primary self-start" pendingLabel="Saving…">Save fixture</PendingButton>
      </div>
    </ActionForm>
  );
}
