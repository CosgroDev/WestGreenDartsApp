import Link from "next/link";
import { getPlayers } from "@/data/players";
import { createPlayerAction, setPlayerActiveAction } from "./actions";

export default async function PlayersPage({ searchParams }: { searchParams?: { error?: string; success?: string } }) {
  const players = await getPlayers();
  const error = searchParams?.error;
  const success = searchParams?.success;

  return (
    <main className="flex flex-col gap-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Team roster</p>
        <h1 className="text-2xl font-bold">Players</h1>
        {error === "duplicate" && (
          <p className="text-sm text-red-700 mt-1">That player name already exists.</p>
        )}
        {success && <p className="text-sm text-emerald-700 mt-1">Player added.</p>}
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Add player</h2>
        <form action={createPlayerAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-700" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              className="rounded-md border border-slate-300 px-3 py-2"
              placeholder="Player name"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="active" defaultChecked className="h-4 w-4" />
            Active
          </label>
          <button
            type="submit"
            className="self-start rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700"
          >
            Save player
          </button>
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
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-sm font-bold text-emerald-700">
                        {p.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w: string) => w[0]?.toUpperCase())
                          .join("")}
                      </span>
                      <p className="font-semibold">{p.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/players/${p.id}`}
                        className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold hover:border-emerald-200"
                        aria-label={`Edit ${p.name}`}
                      >
                        Edit
                      </Link>
                      <form action={setPlayerActiveAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="nextActive" value="false" />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold hover:border-emerald-200"
                        >
                          Deactivate
                        </button>
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
                    <div className="flex items-center gap-3 opacity-60">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-300 bg-slate-100 text-sm font-bold text-slate-600">
                        {p.name
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((w: string) => w[0]?.toUpperCase())
                          .join("")}
                      </span>
                      <p className="font-semibold">{p.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/players/${p.id}`}
                        className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold hover:border-emerald-200"
                        aria-label={`Edit ${p.name}`}
                      >
                        Edit
                      </Link>
                      <form action={setPlayerActiveAction}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="nextActive" value="true" />
                        <button
                          type="submit"
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold hover:border-emerald-200"
                        >
                          Activate
                        </button>
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
