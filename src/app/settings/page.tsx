import Link from "next/link";
import { getSeasons } from "@/data/seasons";
import { AppearanceSettings } from "@/components/AppearanceSettings";
import { ConfirmSubmitButton } from "@/components/ActionForm";
import { lockDeviceAction } from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const seasons = await getSeasons();
  const current = seasons.find(season => season.is_current);
  return <main className="mx-auto flex max-w-2xl flex-col gap-5">
    <header><h1 className="text-2xl font-bold">Settings</h1><p className="mt-1 text-slate-600">Appearance, team management and this device.</p></header>
    <AppearanceSettings />
    <section className="card">
      <h2 className="text-lg font-semibold">Manage team</h2>
      <p className="mt-1 text-sm text-slate-600">These changes apply to the whole team.</p>
      <div className="mt-4 divide-y divide-slate-200">
        <Link href="/players" className="flex min-h-16 items-center justify-between gap-3 py-3">
          <span><span className="block font-semibold">Team roster</span><span className="block text-sm text-slate-600">Add players, edit equipment or deactivate a player</span></span><span aria-hidden="true">→</span>
        </Link>
        <Link href="/seasons" className="flex min-h-16 items-center justify-between gap-3 py-3">
          <span><span className="block font-semibold">Seasons</span><span className="block text-sm text-slate-600">Team default: {current?.name ?? "Not set"}</span></span><span aria-hidden="true">→</span>
        </Link>
      </div>
      <p className="mt-3 text-sm text-slate-600">Browsing another season in Fixtures or Stats does not change the team default.</p>
    </section>
    <section className="card">
      <h2 className="text-lg font-semibold">This device</h2>
      <p className="mb-4 mt-1 text-sm text-slate-600">The team PIN keeps this browser unlocked for 30 days. Lock it when you finish on a shared device.</p>
      <form action={lockDeviceAction}>
        <ConfirmSubmitButton message="Lock this browser now? You will need the team PIN to return. Saved matches and practice sessions stay available." confirmLabel="Lock this device" pendingLabel="Locking…">Lock this device</ConfirmSubmitButton>
      </form>
    </section>
  </main>;
}
