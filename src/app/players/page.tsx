import Link from "next/link";
import { getPlayers } from "@/data/players";
import { createPlayerAction, setPlayerActiveAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export default async function PlayersPage({ searchParams }: { searchParams?: { error?: string; success?: string } }) {
  const players = await getPlayers();
  const error = searchParams?.error;
  const success = searchParams?.success;

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <div className="mb-2">
          <Button variant="secondary" size="sm" asChild className="rounded-full">
            <a href="/dashboard" aria-label="Back to dashboard" title="Back to dashboard">←</a>
          </Button>
        </div>
        <p className="text-sm text-slate-600">Team roster</p>
        <h1 className="text-2xl font-semibold">Players</h1>
        {error === "duplicate" && (
          <p className="text-sm text-red-700 mt-1">That player name already exists.</p>
        )}
        {success && <p className="text-sm text-emerald-700 mt-1">Player added.</p>}
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Add player</h2>
        <form action={createPlayerAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              placeholder="Player name"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <Checkbox name="active" defaultChecked />
            Active
          </label>
          <Button type="submit" className="self-start">
            Save player
          </Button>
        </form>
      </section>

      <section className="card flex flex-col gap-4">
        <details open className="border border-slate-200 rounded-md">
          <summary className="px-3 py-2 text-sm font-semibold text-slate-800 cursor-pointer select-none">Active players</summary>
          {!players.filter((p) => p.active).length ? (
            <p className="text-sm text-slate-600 px-3 py-2">No active players.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-200">
              {players
                .filter((p) => p.active)
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <Badge variant="win" className="mt-0.5">Active</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/players/${p.id}`} aria-label={`Edit ${p.name}`}>Edit</Link>
                      </Button>
                      <form action={setPlayerActiveAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="nextActive" value="false" />
                        <Button variant="outline" size="sm" type="submit">Deactivate</Button>
                      </form>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </details>

        <details className="border border-slate-200 rounded-md">
          <summary className="px-3 py-2 text-sm font-semibold text-slate-800 cursor-pointer select-none">Inactive players</summary>
          {!players.filter((p) => !p.active).length ? (
            <p className="text-sm text-slate-600 px-3 py-2">No inactive players.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-200">
              {players
                .filter((p) => !p.active)
                .map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <p className="font-semibold">{p.name}</p>
                      <Badge variant="neutral" className="mt-0.5">Inactive</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/players/${p.id}`} aria-label={`Edit ${p.name}`}>Edit</Link>
                      </Button>
                      <form action={setPlayerActiveAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="nextActive" value="true" />
                        <Button variant="outline" size="sm" type="submit">Activate</Button>
                      </form>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </details>
      </section>
    </main>
  );
}
