import Link from "next/link";
import type { PlayerCard } from "@/data/stats";
import { getHonours } from "@/lib/honours";

export function HonoursBoard({ players, seasonName, seasonId }: { players: PlayerCard[]; seasonName?: string; seasonId?: string }) {
  const honours = getHonours(players);
  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Honours board</h2>
      <p className="mt-1 mb-3 text-sm text-slate-600">
        {seasonName ? `Season ${seasonName}` : "All recorded seasons"} · Rate awards need at least six completed legs.
        Matches and legs played are shown so each result has context. Equal results share the honour.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {honours.map(honour => (
          <div key={honour.id} className="rounded-2xl border border-slate-300 bg-surface-raised p-4">
            <h3 className="text-sm font-semibold text-emerald-800">{honour.title}</h3>
            <p className="mt-2 text-2xl font-bold text-white">{honour.value}</p>
            {honour.leaders.length ? (
              <details className="mt-2"><summary className="cursor-pointer font-semibold">{honour.leaders[0].player.name}{honour.leaders.length > 1 ? ` and ${honour.leaders.length - 1} shared winner${honour.leaders.length > 2 ? "s" : ""}` : ""} · View evidence</summary><div className="mt-3 space-y-3">
                {honour.leaders.map(({ player, evidence }) => (
                  <div key={player.player_id}>
                    <Link className="font-semibold text-slate-900 underline" href={`/stats/players/${player.player_id}?season=${encodeURIComponent(seasonId || "all")}`}>{player.name}</Link>
                    <p className="text-sm text-slate-700">{evidence}</p>
                    <p className="mt-1 text-sm text-emerald-800">
                      {player.matches_played} match{player.matches_played === 1 ? "" : "es"} with completed legs
                      {" · "}{player.legs_played} legs played
                    </p>
                  </div>
                ))}
              </div></details>
            ) : <p className="mt-2 text-sm text-slate-600">Awaiting qualifying results</p>}
            <p className="mt-3 border-t border-slate-300 pt-2 text-sm text-slate-600">{honour.criteria}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Checkout efficiency counts visits that start on a possible finish, including busts.
        It is a visit success rate; darts attempted at doubles are not recorded.
      </p>
    </section>
  );
}
