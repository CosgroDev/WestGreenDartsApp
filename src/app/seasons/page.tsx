import Link from "next/link";
import { getSeasons } from "@/data/seasons";
import { ActionForm, PendingButton, ConfirmSubmitButton } from "@/components/ActionForm";
import { createSeasonAction, setCurrentSeasonAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SeasonsPage() {
  const seasons = await getSeasons();
  return <main className="mx-auto flex max-w-2xl flex-col gap-5">
    <header><Link href="/settings" className="inline-flex min-h-11 items-center text-sm text-emerald-700">← Settings</Link><h1 className="text-2xl font-bold">Manage seasons</h1>
      <p className="mt-1 text-sm text-slate-600">The team default sets Home and the initial selection across the app for everyone.</p></header>
    <section className="card">
      <h2 className="mb-3 text-lg font-semibold">Add season</h2>
      <ActionForm action={createSeasonAction} className="flex flex-col gap-3" successMessage="Season added.">
        <label htmlFor="season-name" className="text-sm font-semibold">Season name (YY/YY)</label>
        <input id="season-name" name="name" type="text" required pattern="[0-9]{2}/[0-9]{2}" className="input" placeholder="26/27" />
        <label className="inline-flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" name="is_current" className="h-5 w-5" />Use as the team default</label>
        <PendingButton className="btn-primary self-start">Add season</PendingButton>
      </ActionForm>
    </section>
    <section className="card">
      <h2 className="mb-3 text-lg font-semibold">Team seasons</h2>
      {!seasons.length ? <p className="text-sm text-slate-600">No seasons yet. Add one to organise fixtures and results.</p> : <div className="divide-y divide-slate-200">
        {seasons.map(season => <div key={season.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div><p className="font-semibold">{season.name}</p>{season.is_current && <p className="text-sm text-emerald-700">Team default</p>}</div>
          {!season.is_current && <ActionForm action={setCurrentSeasonAction.bind(null, season.id)} successMessage={`${season.name} is now the team default.`}>
            <ConfirmSubmitButton message={`Use ${season.name} as the default season for the whole team? This changes Home and the initial season shown in Fixtures and Stats.`} confirmLabel="Use as team default">Set team default</ConfirmSubmitButton>
          </ActionForm>}
        </div>)}
      </div>}
    </section>
  </main>;
}
