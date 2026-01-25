import { getPlayers } from "@/data/players";
import { updatePlayerAction, deletePlayerAction } from "../actions";
import { notFound } from "next/navigation";

type Props = { params: { id: string } };

export default async function PlayerEditPage({ params }: Props) {
  const players = await getPlayers();
  const player = players.find((p) => p.id === params.id);
  if (!player) return notFound();

  return (
    <main className="flex flex-col gap-4">
      <header className="card flex items-center gap-2">
        <a
          href="/players"
          className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
          aria-label="Back to players"
          title="Back to players"
        >
          ←
        </a>
        <div>
          <p className="text-sm text-slate-600">Edit player</p>
          <h1 className="text-2xl font-semibold">{player.name}</h1>
        </div>
      </header>

      <section className="card">
        <form action={updatePlayerAction} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={player.id} />
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-700" htmlFor="name">Name</label>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={player.name}
              required
              className="rounded-md border border-slate-300 px-3 py-2"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-700" htmlFor="dart_model">Dart model</label>
              <input
                id="dart_model"
                name="dart_model"
                type="text"
                defaultValue={player.dart_model || ""}
                className="rounded-md border border-slate-300 px-3 py-2"
                placeholder="e.g. 21g Target"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-700" htmlFor="stem_length">Stem length</label>
              <input
                id="stem_length"
                name="stem_length"
                type="text"
                defaultValue={player.stem_length || ""}
                className="rounded-md border border-slate-300 px-3 py-2"
                placeholder="e.g. Short"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm text-slate-700" htmlFor="flight_type">Flight type</label>
              <input
                id="flight_type"
                name="flight_type"
                type="text"
                defaultValue={player.flight_type || ""}
                className="rounded-md border border-slate-300 px-3 py-2"
                placeholder="e.g. Standard"
              />
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="active" className="h-4 w-4" defaultChecked={player.active} />
            Active
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700"
            >
              Save
            </button>
            <a
              href="/players"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-200"
            >
              Cancel
            </a>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Delete player</h2>
        <p className="text-sm text-slate-600 mb-3">Player must be inactive before deletion.</p>
        <form action={deletePlayerAction}>
          <input type="hidden" name="id" value={player.id} />
          <button
            type="submit"
            className="rounded-md bg-red-600 px-4 py-2 text-white font-semibold hover:bg-red-700 disabled:opacity-50"
            disabled={player.active}
          >
            Delete player
          </button>
          {player.active && (
            <p className="text-xs text-red-700 mt-2">Deactivate this player first to enable deletion.</p>
          )}
        </form>
      </section>
    </main>
  );
}
