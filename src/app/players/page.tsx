import Link from "next/link";
import { getPlayers } from "@/data/players";
import { ActionForm, PendingButton, ConfirmSubmitButton } from "@/components/ActionForm";
import { createPlayerAction, setPlayerActiveAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlayersPage({ searchParams: paramsPromise }: { searchParams?: Promise<{ error?: string; success?: string }> }) {
  const params = await paramsPromise;
  const players = await getPlayers();
  return <main className="mx-auto flex max-w-2xl flex-col gap-5">
    <header><Link href="/settings" className="inline-flex min-h-11 items-center text-sm text-emerald-700">← Settings</Link><h1 className="text-2xl font-bold">Team roster</h1>
      <p className="mt-1 text-sm text-slate-600">Manage players here. <Link href="/stats?view=players" className="text-emerald-700 underline">See player performance in Stats.</Link></p>
      {params?.error === "duplicate" && <p role="alert" className="mt-2 text-sm text-red-700">That player name already exists.</p>}
      {params?.success && <p role="status" className="mt-2 text-sm text-emerald-700">{params.success === "updated" ? "Player updated." : params.success === "removed" ? "Player deleted." : params.success === "status" ? "Player availability updated." : "Player added."}</p>}
    </header>
    <section className="card">
      <h2 className="mb-3 text-lg font-semibold">Add player</h2>
      <ActionForm action={createPlayerAction} className="flex flex-col gap-3" successMessage="Player added.">
        <label htmlFor="player-name" className="text-sm font-semibold">Player name</label>
        <input id="player-name" name="name" type="text" required maxLength={100} className="input" placeholder="Player name" />
        <label className="inline-flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="active" defaultChecked className="h-5 w-5" />Available for selection</label>
        <PendingButton className="btn-primary self-start">Add player</PendingButton>
      </ActionForm>
    </section>
    <section className="card">
      <h2 className="text-lg font-semibold">Players</h2>
      <p className="mb-4 mt-1 text-sm text-slate-600">Deactivate players who leave or take a break. Their recorded history is kept.</p>
      {[true, false].map(active => <details key={String(active)} open={active} className="mb-3 rounded-xl border border-slate-200">
        <summary className="cursor-pointer px-4 py-3 font-semibold">{active ? "Active" : "Inactive"} players ({players.filter(player => player.active === active).length})</summary>
        <div className="divide-y divide-slate-200">
          {players.filter(player => player.active === active).map(player => <div key={player.id} className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href={`/players/${player.id}`} className="flex min-w-0 flex-1 items-center gap-3" aria-label={`Manage ${player.name}`}>
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-sm font-bold text-emerald-700">{player.name.split(/\s+/).slice(0, 2).map(word => word[0]?.toUpperCase()).join("")}</span>
              <span className="min-w-0 break-words font-semibold">{player.name}<span className="block text-sm font-normal text-slate-600">Manage player →</span></span>
            </Link>
            <ActionForm action={setPlayerActiveAction} className="w-full sm:w-auto sm:max-w-[55%]" successMessage="Player availability updated.">
              <input type="hidden" name="id" value={player.id} /><input type="hidden" name="nextActive" value={String(!active)} />
              {active ? <ConfirmSubmitButton message={`Deactivate ${player.name}? Their history stays in Stats and they will no longer appear in active player selections.`} confirmLabel="Deactivate">Deactivate</ConfirmSubmitButton> : <PendingButton className="btn-secondary" pendingLabel="Activating…">Reactivate</PendingButton>}
            </ActionForm>
          </div>)}
          {!players.some(player => player.active === active) && <p className="p-4 text-sm text-slate-600">No {active ? "active" : "inactive"} players.</p>}
        </div>
      </details>)}
    </section>
  </main>;
}
