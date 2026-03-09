"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { toast } from "sonner";
import { createFixtureAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

type SeasonOption = { id: string; name: string; is_current?: boolean };

const initialState = { ok: false, message: "" as string | undefined };

export function CreateFixtureForm({ seasons, defaultSeasonId }: { seasons: SeasonOption[]; defaultSeasonId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(createFixtureAction, initialState);

  useEffect(() => {
    if (state?.ok) {
      toast.success("Fixture saved");
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
    } else if (state?.message && !state.ok && state.message !== "") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="grid grid-cols-1 gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="season">Season</Label>
        <select
          id="season"
          name="seasonId"
          className="flex h-10 w-full rounded-md border border-slate-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue={defaultSeasonId}
          required
        >
          <option value="" disabled>Select season</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.is_current ? "(current)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="startsAt">Date & time</Label>
        <Input
          id="startsAt"
          name="startsAt"
          type="datetime-local"
          required
          defaultValue={new Date().toISOString().slice(0, 16)}
        />
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <Checkbox name="home" />
        Home fixture
      </label>

      <div className="flex flex-col gap-1">
        <Label htmlFor="opponent">Opponent</Label>
        <Input id="opponent" name="opponent" type="text" required placeholder="Opponent team name" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="venue">Venue (optional)</Label>
        <Input id="venue" name="venue" type="text" placeholder="Venue" />
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" rows={2} placeholder="Any extra info" />
      </div>

      <Button type="submit" className="self-start">Save fixture</Button>
    </form>
  );
}
