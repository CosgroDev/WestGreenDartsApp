import type { PlayerCard } from "@/data/stats";
import { getHonours } from "@/lib/honours";

export function HonoursBoard({ players, seasonName }: { players: PlayerCard[]; seasonName?: string }) {
  const honours = getHonours(players);
  return (
    <section className="card">
      <h2 className="text-lg font-semibold">Honours board</h2>
      <p className="mt-1 mb-3 text-sm text-slate-400">
        {seasonName ? `Season ${seasonName}` : "All recorded seasons"} · Rate awards need at least six completed legs.
        Matches and legs played are shown so each result has context. Equal results share the honour.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {honours.map(honour => (
          <div key={honour.id} className="rounded-2xl border border-emerald-800 bg-slate-900/40 p-4">
            <h3 className="text-sm font-semibold text-emerald-300">{honour.title}</h3>
            <p className="mt-2 text-2xl font-bold text-white">{honour.value}</p>
            {honour.leaders.length ? (
              <div className="mt-2 space-y-3">
                {honour.leaders.map(({ player, evidence }) => (
                  <div key={player.player_id}>
                    <p className="font-semibold text-slate-100">{player.name}</p>
                    <p className="text-xs text-slate-300">{evidence}</p>
                    <p className="mt-1 text-xs text-emerald-300">
                      {player.matches_played} match{player.matches_played === 1 ? "" : "es"} with completed legs
                      {" · "}{player.legs_played} legs played
                    </p>
                  </div>
                ))}
              </div>
            ) : <p className="mt-2 text-sm text-slate-400">Awaiting qualifying results</p>}
            <p className="mt-3 border-t border-slate-700 pt-2 text-xs text-slate-400">{honour.criteria}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        Checkout efficiency counts visits that start on a possible finish, including busts.
        It is a visit success rate; darts attempted at doubles are not recorded.
      </p>
    </section>
  );
}
