import { getPlayers } from "@/data/players";
import { updatePlayerAction, deletePlayerAction } from "../actions";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

type Props = { params: { id: string } };

export default async function PlayerEditPage({ params }: Props) {
  const players = await getPlayers();
  const player = players.find((p) => p.id === params.id);
  if (!player) return notFound();

  return (
    <main className="flex flex-col gap-4">
      <header className="card flex items-center gap-2">
        <Button variant="secondary" size="sm" asChild className="rounded-full">
          <a href="/players" aria-label="Back to players" title="Back to players">←</a>
        </Button>
        <div>
          <p className="text-sm text-slate-600">Edit player</p>
          <h1 className="text-2xl font-semibold">{player.name}</h1>
        </div>
      </header>

      <section className="card">
        <form action={updatePlayerAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={player.id} />
          <div className="flex flex-col gap-1">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" type="text" defaultValue={player.name} required />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="dart_model">Dart model</Label>
              <Input id="dart_model" name="dart_model" type="text" defaultValue={player.dart_model || ""} placeholder="e.g. 21g Target" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="stem_length">Stem length</Label>
              <Input id="stem_length" name="stem_length" type="text" defaultValue={player.stem_length || ""} placeholder="e.g. Short" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="flight_type">Flight type</Label>
              <Input id="flight_type" name="flight_type" type="text" defaultValue={player.flight_type || ""} placeholder="e.g. Standard" />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <Checkbox name="active" defaultChecked={player.active} />
            Active
          </label>
          <div className="flex gap-2">
            <Button type="submit">Save</Button>
            <Button variant="outline" asChild>
              <a href="/players">Cancel</a>
            </Button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Delete player</h2>
        <p className="text-sm text-slate-600 mb-3">Player must be inactive before deletion.</p>
        <form action={deletePlayerAction}>
          <input type="hidden" name="id" value={player.id} />
          <Button variant="destructive" type="submit" disabled={player.active}>
            Delete player
          </Button>
          {player.active && (
            <p className="text-xs text-red-700 mt-2">Deactivate this player first to enable deletion.</p>
          )}
        </form>
      </section>
    </main>
  );
}
