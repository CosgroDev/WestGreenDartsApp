"use client";
import Link from "next/link";
import { useState } from "react";
import { FormPills } from "@/components/FormPills";
import type { PlayerCard } from "@/data/stats";
import type { PerformanceLeaderboard } from "@/lib/playerPerformance";
import { compareLeaderboardPlayers } from "@/lib/leaderboard";
import { LeaderboardExplanation } from "./LeaderboardExplanation";

type Props = { players: PlayerCard[]; formByPlayer: Record<string, ("W" | "D" | "L")[]>; seasonId: string; performance: PerformanceLeaderboard };
export function Leaderboard({ players, formByPlayer, seasonId, performance }: Props) {
  const [ranking, setRanking] = useState<"performance" | "wins" | "average">("performance");
  const ratingsById = new Map(performance.ratings.map(rating => [rating.playerId, rating]));
  const playersById = new Map(players.map(player => [player.player_id, player]));
  const orderedPlayers = ranking === "performance" ? performance.ratings.flatMap(rating => {
    const player = playersById.get(rating.playerId); return player ? [player] : [];
  }) : [...players].sort(ranking === "wins" ? compareLeaderboardPlayers : (a, b) => (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0));
  return <div className="space-y-3">
    <label className="flex flex-wrap items-center gap-2 text-sm font-semibold">Rank players by
      <select className="input min-w-0" value={ranking} onChange={event => setRanking(event.target.value as typeof ranking)}>
        <option value="performance">Overall performance</option><option value="wins">Leg win %</option><option value="average">Three-dart average</option>
      </select>
    </label>
    <p className="text-sm text-slate-600">{ranking === "performance" ? "Results, scoring and finishing, adjusted for sample size. Provisional players follow qualified players." : ranking === "wins" ? "Raw leg win percentage. Ties use wins, then three-dart average." : "Average points scored per three darts across recorded completed legs."}</p>
    <LeaderboardExplanation model={performance} />
    <div className="divide-y divide-slate-200">
      {orderedPlayers.map((player, index) => {
        const rating = ratingsById.get(player.player_id);
        const position = ranking === "performance" ? rating?.rank : index + 1;
        const winPct = player.legs_played ? 100 * player.legs_won / player.legs_played : null;
        const metric = ranking === "performance" ? rating?.score?.toFixed(1) ?? "–" : ranking === "wins" ? winPct?.toFixed(0) ?? "–" : player.three_dart_avg?.toFixed(1) ?? "–";
        return <Link key={player.player_id} href={`/stats/players/${player.player_id}?season=${encodeURIComponent(seasonId || "all")}`}
          className="flex min-h-16 items-center gap-3 py-3">
          <span className="w-6 shrink-0 text-sm text-slate-600">{position ?? "–"}</span>
          <div className="min-w-0 flex-1"><p className="break-words font-semibold">{player.name}</p>
            <p className="text-sm text-slate-600">{player.matches_played} matches · {player.legs_played} legs{ranking === "performance" && !rating?.qualified ? " · Provisional" : ""}</p>
            <div className="mt-1"><FormPills form={formByPlayer[player.player_id] ?? []} /></div>
          </div>
          <span className="shrink-0 text-right font-bold tabular-nums">{metric}{ranking === "wins" && winPct !== null ? "%" : ""}<span className="ml-2" aria-hidden="true">→</span></span>
        </Link>;
      })}
      {!players.length && <p className="py-3 text-sm text-slate-600">No completed legs recorded in this season. Player profiles are available below.</p>}
    </div>
  </div>;
}
