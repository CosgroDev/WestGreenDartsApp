"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Season } from "@/data/seasons";

export function StatsSeasonFilter({ seasons, selected, view, playerId }: { seasons: Season[]; selected: string; view: string; playerId?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <label className="flex min-w-0 max-w-full items-center gap-2 text-sm">
    <span className="shrink-0">Season</span>
    <select className="input min-w-0 flex-1" value={selected} disabled={pending} onChange={event => {
      const season = event.target.value;
      startTransition(() => router.push(`${playerId ? `/stats/players/${playerId}` : "/stats"}?view=${view}&season=${encodeURIComponent(season)}`));
    }}>
      <option value="all">All recorded seasons</option>
      {seasons.map(season => <option key={season.id} value={season.id}>{season.name}{season.is_current ? " (team default)" : ""}</option>)}
    </select>
    {pending && <span className="sr-only" role="status">Loading season…</span>}
  </label>;
}
