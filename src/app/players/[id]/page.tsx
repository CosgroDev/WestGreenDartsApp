import Link from "next/link";
import { ActionForm, PendingButton, ConfirmSubmitButton } from "@/components/ActionForm";
import { getPlayers } from "@/data/players";
import { updatePlayerAction, deletePlayerAction } from "../actions";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ id: string }> };

export default async function PlayerEditPage({ params: paramsPromise }: Props) {
  const params = await paramsPromise;
  const players = await getPlayers();
  const player = players.find((p) => p.id === params.id);
  if (!player) return notFound();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5">
      <header className="flex min-w-0 items-center gap-3">
        <Link
          href="/players"
          className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
          aria-label="Back to players"
          title="Back to players"
        >
          ←
        </Link>
        <div className="min-w-0 break-words">
          <p className="text-sm text-slate-600">Manage player</p>
          <h1 className="text-2xl font-semibold">{player.name}</h1>
        </div>
      </header>

      <section className="card">
        <ActionForm action={updatePlayerAction} className="flex flex-col gap-3" successMessage="Player updated.">
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
            <PendingButton>Save player</PendingButton>
            <Link
              href="/players"
              className="inline-flex items-center justify-center rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-200"
            >
              Cancel
            </Link>
          </div>
        </ActionForm>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold">Recorded history</h2>
        <Link href={`/stats/players/${player.id}`} className="mt-3 inline-flex min-h-11 items-center text-emerald-700">View performance and match history →</Link>
        <p className="mt-2 text-sm text-slate-600">Deactivate the player to remove them from team selections while keeping their name and history.</p>
      </section>
      <details className="card">
        <summary className="cursor-pointer font-semibold text-red-700">Delete player permanently</summary>
        <p className="my-3 text-sm text-slate-600">Only inactive players can be deleted. Recorded matches may prevent deletion; practice records may lose their player link. Keep the player inactive to retain their history.</p>
        {player.active ? <p className="text-sm text-slate-600">Deactivate and save this player first.</p> : <ActionForm action={deletePlayerAction} successMessage="Player deleted.">
          <input type="hidden" name="id" value={player.id} />
          <ConfirmSubmitButton message={`Permanently delete ${player.name}? This cannot be undone and may unlink their practice history. Deactivation preserves their history.`} confirmLabel="Delete permanently" className="btn-secondary text-red-700" pendingLabel="Deleting…">Delete player</ConfirmSubmitButton>
        </ActionForm>}
      </details>
    </main>
  );
}
