"use client";

import { useState } from "react";

type PlayerBands = {
  player_id: string;
  name: string;
  sixty_plus: number;
  hundred_plus: number;
  hundred_forty_plus: number;
  one_eighty: number;
};

type TeamBands = {
  sixty_plus: number;
  hundred_plus: number;
  hundred_forty_plus: number;
  one_eighty_count: number;
};

type Props = {
  team: TeamBands;
  players: PlayerBands[];
};

export function ScoringBreakdown({ team, players }: Props) {
  const [selected, setSelected] = useState<string>("all");

  const player = players.find((p) => p.player_id === selected);
  const bands = player
    ? {
        sixty_plus: player.sixty_plus,
        hundred_plus: player.hundred_plus,
        hundred_forty_plus: player.hundred_forty_plus,
        one_eighty: player.one_eighty,
      }
    : {
        sixty_plus: team.sixty_plus,
        hundred_plus: team.hundred_plus,
        hundred_forty_plus: team.hundred_forty_plus,
        one_eighty: team.one_eighty_count,
      };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="scoring-player" className="text-sm text-slate-600 shrink-0">
          View for
        </label>
        <select
          id="scoring-player"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="all">All players</option>
          {players.map((p) => (
            <option key={p.player_id} value={p.player_id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">60+ visits</p>
          <p className="text-2xl font-bold text-slate-800">{bands.sixty_plus}</p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3">
          <p className="text-xs text-emerald-700 font-medium uppercase tracking-wide">100+ tons</p>
          <p className="text-2xl font-bold text-emerald-800">{bands.hundred_plus}</p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-3">
          <p className="text-xs text-purple-700 font-medium uppercase tracking-wide">140+ tons</p>
          <p className="text-2xl font-bold text-purple-800">{bands.hundred_forty_plus}</p>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">180s</p>
          <p className="text-2xl font-bold text-amber-800">{bands.one_eighty}</p>
        </div>
      </div>
    </div>
  );
}
