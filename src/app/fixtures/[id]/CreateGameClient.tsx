"use client";

import { useEffect, useRef } from "react";
import { useFormState } from "react-dom";
import { toast } from "sonner";
import { createGameAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = { fixtureId: string; disable: boolean; players: { id: string; name: string }[] };

const initialState = { ok: false, message: "" };

export function CreateGameForm({ fixtureId, disable, players }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useFormState(createGameAction, initialState);

  useEffect(() => {
    if (state.ok) {
      const opp = formRef.current?.elements.namedItem("opponent") as HTMLInputElement | null;
      if (opp) opp.value = "";
    } else if (state.message && !state.ok && state.message !== "") {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-3" method="post" ref={formRef}>
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="playerId">West Green player</Label>
          <select
            id="playerId"
            name="playerId"
            className="flex h-10 w-full rounded-md border border-slate-300 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue=""
            disabled={disable}
            required
          >
            <option value="">Select player</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="opponent">Opponent player</Label>
          <Input id="opponent" name="opponent" type="text" required placeholder="Opponent name" disabled={disable} />
        </div>
      </div>

      <Button type="submit" disabled={disable} className="self-start">
        Create game
      </Button>
    </form>
  );
}
