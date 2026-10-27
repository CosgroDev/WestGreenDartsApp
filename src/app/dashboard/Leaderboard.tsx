"use client";

import { useState, useTransition } from "react";
import { FormPills } from "@/components/FormPills";
import type { PlayerCard, PlayerGameStat } from "@/data/stats";
import type { PerformanceLeaderboard, PlayerPerformance } from "@/lib/playerPerformance";
import type { PlayerAura } from "@/lib/playerAura";
import { compareLeaderboardPlayers } from "@/lib/leaderboard";
import { LeaderboardExplanation } from "./LeaderboardExplanation";
import { PlayerAiInsight } from "./PlayerAiInsight";
import { loadPlayerGameLogAction } from "./actions";

type Props = {
  players: PlayerCard[];
  formByPlayer: Record<string, ("W" | "D" | "L")[]>;
  seasonId: string;
  performance: PerformanceLeaderboard;
  auras: Record<string, PlayerAura>;
};

export function Leaderboard({ players, formByPlayer, seasonId, performance, auras }: Props) {
  const [ranking, setRanking] = useState<"performance" | "wins">("performance");
  const ratingsById = new Map(performance.ratings.map(r => [r.playerId, r]));
  const playersById = new Map(players.map(p => [p.player_id, p]));
  const orderedPlayers = ranking === "performance"
    ? performance.ratings.map(r => playersById.get(r.playerId)!)
    : [...players].sort(compareLeaderboardPlayers);
  const [openId, setOpenId] = useState<string | null>(null);
  const [logs, setLogs] = useState<Record<string, PlayerGameStat[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (pid: string) => {
    if (openId === pid) {
      setOpenId(null);
      return;
    }
    setOpenId(pid);
    if (!logs[pid]) {
      setLoadingId(pid);
      startTransition(async () => {
        const res = await loadPlayerGameLogAction(pid, seasonId);
        setLogs((prev) => ({ ...prev, [pid]: res.ok ? res.games : [] }));
        setLoadingId((cur) => (cur === pid ? null : cur));
      });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor="leaderboard-ranking" className="text-sm font-semibold">Rank by</label>
        <select id="leaderboard-ranking" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          value={ranking} onChange={e => setRanking(e.target.value as "performance" | "wins")}>
          <option value="performance">Overall performance</option><option value="wins">Leg win %</option>
        </select>
      </div>
      <p className="text-xs text-slate-600">{ranking === "performance"
        ? "Results, scoring and finishing, adjusted for sample size. Provisional players follow qualified players."
        : "Raw leg win percentage. Ties use wins, then three-dart average. Small samples are not adjusted."}</p>
      <LeaderboardExplanation model={performance} />
      <div className="grid grid-cols-1 gap-2">
      {orderedPlayers.map((p, rank) => {
        const rating = ratingsById.get(p.player_id)!;
        const position = ranking === "performance" ? rating.rank : rank + 1;
        const isLeader = position === 1;
        const winPct = p.legs_played > 0 ? (p.legs_won / p.legs_played) * 100 : null;
        const lost = (p.legs_played ?? 0) - (p.legs_won ?? 0);
        const diff = (p.legs_won ?? 0) - lost;
        const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
        const isOpen = openId === p.player_id;
        const log = logs[p.player_id];
        const aura = auras[p.player_id];
        return (
          <div
            key={p.player_id}
            className={`rounded-2xl border text-sm ${
              isLeader ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-slate-50/40"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(p.player_id)}
              aria-expanded={isOpen}
              className="flex w-full flex-col gap-3 px-4 py-3 text-left"
            >
              <span className="flex w-full items-center gap-2">
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isLeader
                      ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300"
                      : position === 2
                      ? "bg-slate-100 text-slate-800 ring-1 ring-slate-300"
                      : position === 3
                      ? "bg-amber-50 text-amber-600"
                      : "bg-slate-50 text-slate-500"
                  }`}
                >
                  {position ?? "–"}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-base font-semibold">{p.name}</span>
                  {!rating.qualified && <span className="block text-[11px] text-slate-500">Provisional</span>}
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <FormPills form={formByPlayer[p.player_id] ?? []} />
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200" title="AI player insights inside">
                    ✨ AI
                  </span>
                  <span className={`text-xs text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden>
                    ▾
                  </span>
                </span>
              </span>
              <span className="grid w-full grid-cols-3 gap-2">
                <HeadlineStat label="3DA" value={p.three_dart_avg !== null ? p.three_dart_avg.toFixed(1) : "–"} />
                <HeadlineStat
                  label="Win %"
                  value={winPct !== null ? winPct.toFixed(0) + "%" : "–"}
                  tone={winPct === null ? undefined : winPct >= 50 ? "text-emerald-700" : "text-red-600"}
                />
                <HeadlineStat label="Performance" value={rating.score === null ? "–" : rating.score.toFixed(1)} />
              </span>
            </button>

            {isOpen && (
              <div className="flex flex-col gap-3 border-t border-slate-200 px-4 pb-4 pt-3">
                <AuraBadge aura={aura} />
                <PlayerAiInsight playerId={p.player_id} seasonId={seasonId} playerName={p.name} />
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <DetailStat label="Won – lost" value={`${p.legs_won} – ${lost}`} />
                  <DetailStat label="Leg diff" value={diffLabel} />
                  <DetailStat label="First 9" value={p.first_nine_avg !== null ? p.first_nine_avg.toFixed(1) : "–"} />
                  <DetailStat label="Checkout" value={p.checkout_pct !== null ? p.checkout_pct.toFixed(0) + "%" : "–"} />
                  <DetailStat label="Darts/leg won" value={p.darts_per_leg_won !== null ? p.darts_per_leg_won.toFixed(1) : "–"} />
                  <DetailStat label="High finish" value={p.high_finish !== null ? String(p.high_finish) : "–"} />
                  <DetailStat label="Matches" value={String(p.matches_played)} />
                  <DetailStat label="Visits" value={String(p.scoring_visits)} />
                  <DetailStat label="60+" value={String(p.sixty_plus)} />
                  <DetailStat label="100+" value={String(p.hundred_plus)} />
                  <DetailStat label="140+" value={String(p.hundred_forty_plus)} />
                  <DetailStat label="180s" value={String(p.one_eighty)} />
                  <DetailStat label="26s" value={String(p.twenty_six)} />
                </dl>

                <PerformanceBreakdown rating={rating} />

                <div className="border-t border-slate-200 pt-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Game by game
                  </p>
                  {loadingId === p.player_id && !log ? (
                    <p className="text-xs text-slate-400">Loading games…</p>
                  ) : log && log.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {log.map((g) => (
                        <GameCard key={g.game_id} game={g} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400">No completed games in this season.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}

function HeadlineStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <span className="flex flex-col rounded-xl bg-slate-100 px-2 py-2 text-center">
      <span className={`text-lg font-bold tabular-nums ${tone ?? "text-slate-900"}`}>{value}</span>
      <span className="text-[11px] text-slate-500">{label}</span>
    </span>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-1">
      <dt className="truncate text-xs text-slate-500">{label}</dt>
      <dd className="shrink-0 font-semibold tabular-nums text-slate-800">{value}</dd>
    </div>
  );
}

const AURA_STYLES: Record<string, string> = {
  inferno: "border-orange-300 bg-orange-50 text-orange-900",
  electric: "border-violet-300 bg-violet-50 text-violet-900",
  sparkling: "border-sky-300 bg-sky-50 text-sky-900",
  glimmer: "border-indigo-200 bg-indigo-50 text-indigo-800",
  steady: "border-slate-200 bg-slate-50 text-slate-600",
};

function AuraBadge({ aura }: { aura?: PlayerAura }) {
  if (!aura?.tier) return null;
  const detail = aura.components.map(c => `${c.label}: ${c.percentile.toFixed(0)}th pct`).join(" · ");
  return (
    <span
      title={`${aura.tier.blurb}. Flair ${aura.score!.toFixed(0)}/100${aura.provisional ? " (provisional)" : ""}. ${detail}`}
      className={`self-start rounded-full border px-3 py-1 text-xs font-semibold ${AURA_STYLES[aura.tier.id]}`}
    >
      {aura.tier.emoji} {aura.tier.name} aura{aura.trait ? ` · ${aura.trait}` : ""}{aura.provisional ? " (forming)" : ""}
    </span>
  );
}

function GameCard({ game }: { game: PlayerGameStat }) {
  const date = new Date(game.date);
  const dateLabel = isNaN(date.getTime())
    ? ""
    : date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return (
    <div
      className={`rounded-xl border px-3 py-2.5 ${
        game.won ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">vs {game.opponent}</p>
          {dateLabel && <p className="text-[11px] text-slate-400">{dateLabel}</p>}
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
            game.won ? "bg-emerald-100 text-emerald-700" : "bg-red-50 text-red-600"
          }`}
        >
          {game.won ? "W" : "L"}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Stat label="3DA" value={game.three_dart_avg !== null ? game.three_dart_avg.toFixed(1) : "–"} />
        <Stat label="First 9" value={game.first_nine_avg !== null ? game.first_nine_avg.toFixed(1) : "–"} />
        <Stat label="Darts" value={game.darts_thrown !== null ? String(game.darts_thrown) : "–"} />
        <Stat
          label={game.won ? "Checkout" : "High finish"}
          value={(game.won ? game.checkout : game.high_finish) !== null
            ? String(game.won ? game.checkout : game.high_finish)
            : "–"}
        />
      </div>

      {(game.one_eighty > 0 || game.hundred_forty_plus > 0 || game.hundred_plus > 0 || game.twenty_six > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {game.one_eighty > 0 && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
              {game.one_eighty} × 180
            </span>
          )}
          {game.hundred_forty_plus > 0 && (
            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
              {game.hundred_forty_plus} × 140+
            </span>
          )}
          {game.hundred_plus > 0 && (
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
              {game.hundred_plus} × 100+
            </span>
          )}
          {game.twenty_six > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
              {game.twenty_six} × 26
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-slate-400">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  );
}

function PerformanceBreakdown({ rating }: { rating: PlayerPerformance }) {
  const format = (value: number | null, percent: boolean) => value === null ? "No data" : value.toFixed(1) + (percent ? "%" : "");
  return <details className="border-t border-slate-200 pt-2 text-xs">
    <summary className="cursor-pointer font-semibold text-emerald-800">Score breakdown</summary>
    {rating.reasons.length > 0 && <p className="mt-2 text-slate-700">Provisional: {rating.reasons.join("; ")}.</p>}
    <p className="mt-2 text-slate-600">These contributions sum to {rating.score === null ? "no score yet" : rating.score.toFixed(1) + "/100"}. Values below are rounded.</p>
    <dl className="mt-2 space-y-3">
      {rating.components.map(c => <div key={c.id} className="rounded-lg border border-slate-200 p-2">
        <dt className="flex flex-wrap justify-between gap-2 font-semibold text-slate-900"><span>{c.label} · {c.weight}% weight</span><span>{c.contribution.toFixed(1)} / {c.weight} points</span></dt>
        <dd className="mt-1 text-slate-700">Raw {format(c.raw,c.percent)} · {c.sample} {c.unit} · Team {format(c.baseline,c.percent)}</dd>
        <dd className="mt-1 text-slate-700">Adjusted {format(c.adjusted,c.percent)} · {Math.round(c.dataWeight*100)}% player data / {Math.round((1-c.dataWeight)*100)}% team prior</dd>
        <dd className="mt-1 text-slate-700">{c.percentile.toFixed(1)} percentile × {c.weight}% = {c.contribution.toFixed(1)} points{c.raw===null?" (neutral: missing evidence)":""}</dd>
      </div>)}
    </dl>
  </details>;
}
