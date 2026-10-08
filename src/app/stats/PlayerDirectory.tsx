import Link from "next/link";
import { getPlayers } from "@/data/players";
export async function PlayerDirectory({ season }: { season: string }) {
  const players = await getPlayers();
  return <div className="mt-3 divide-y divide-slate-200">
    {players.length ? players.map(player => <Link key={player.id} href={`/stats/players/${player.id}?season=${encodeURIComponent(season)}`}
      className="flex min-h-12 items-center justify-between gap-3 py-3">
      <span className="min-w-0 break-words font-semibold">{player.name}{!player.active && <span className="ml-2 text-sm font-normal text-slate-600">Inactive</span>}</span>
      <span aria-hidden="true">→</span>
    </Link>) : <p className="text-sm text-slate-600">No players have been added yet.</p>}
  </div>;
}
