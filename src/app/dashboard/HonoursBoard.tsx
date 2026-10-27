import type { PlayerCard } from "@/data/stats";
import { getHonours } from "@/lib/honours";

export function HonoursBoard({ players, seasonName }: { players: PlayerCard[]; seasonName?: string }) {
  const honours = getHonours(players);
  return (
    <section className="card">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Honours board</h2>
        <span className="text-xs text-slate-500">{seasonName ? `Season ${seasonName}` : "All seasons"}</span>
      </div>
      <p className="mt-1 mb-3 text-xs text-slate-600">Tap an award for the evidence.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {honours.map(honour => (
          <details key={honour.id} className="group rounded-xl border border-slate-300 bg-surface-raised px-3 py-2.5">
            <summary className="flex cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-emerald-800">{honour.title}</p>
                <p className="truncate font-semibold text-slate-900">
                  {honour.leaders.length
                    ? honour.leaders.map(l => l.player.name).join(" & ")
                    : <span className="font-normal text-slate-500">Awaiting qualifying results</span>}
                </p>
              </div>
              <p className="shrink-0 text-xl font-bold tabular-nums text-white">{honour.value}</p>
              <span className="text-xs text-slate-400 transition-transform group-open:rotate-180" aria-hidden>▾</span>
            </summary>
            <div className="mt-2 space-y-2 border-t border-slate-300 pt-2 text-sm">
              {honour.leaders.map(({ player, evidence }) => (
                <div key={player.player_id}>
                  {honour.leaders.length > 1 && <p className="font-semibold text-slate-900">{player.name}</p>}
                  <p className="text-slate-700">{evidence}</p>
                  <p className="text-xs text-slate-500">
                    {player.matches_played} match{player.matches_played === 1 ? "" : "es"} with completed legs
                    {" · "}{player.legs_played} legs played
                  </p>
                </div>
              ))}
              <p className="text-xs text-slate-600">{honour.criteria}</p>
            </div>
          </details>
        ))}
      </div>
      <details className="mt-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold text-emerald-800">About these awards</summary>
        <p className="mt-2">
          Rate awards need at least six completed legs. Matches and legs played are shown so each result has
          context. Equal results share the honour.
        </p>
        <p className="mt-2">
          Checkout efficiency counts visits that start on a possible finish, including busts.
          It is a visit success rate; darts attempted at doubles are not recorded.
        </p>
      </details>
    </section>
  );
}
