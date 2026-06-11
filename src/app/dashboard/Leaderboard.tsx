"use client";

import { useState, useTransition } from "react";
import { StatBar } from "@/components/StatBar";
import { FormPills } from "@/components/FormPills";
import type { PlayerCard, PlayerGameStat } from "@/data/stats";
import { loadPlayerGameLogAction } from "./actions";

type Props = {
  players: PlayerCard[];
  formByPlayer: Record<string, ("W" | "D" | "L")[]>;
  seasonId: string;
};

export function Leaderboard({ players, formByPlayer, seasonId }: Props) {
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
    <div className="grid grid-cols-1 gap-2 max-h-[600px] overflow-y-auto pr-1">
      {players.map((p, rank) => {
        const winPct = p.legs_played > 0 ? (p.legs_won / p.legs_played) * 100 : null;
        const diff = (p.legs_won ?? 0) - ((p.legs_played ?? 0) - (p.legs_won ?? 0));
        const diffColor =
          diff > 0 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700";
        const diffLabel = diff > 0 ? `+${diff}` : `${diff}`;
        const isOpen = openId === p.player_id;
        const log = logs[p.player_id];
        return (
          <div
            key={p.player_id}
            className={`flex flex-col gap-3 rounded-2xl border px-4 py-3 text-sm ${
              rank === 0 ? "border-amber-200 bg-amber-50/40" : "border-slate-200 bg-slate-50/40"
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(p.player_id)}
              aria-expanded={isOpen}
              className="flex flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="w-full sm:w-auto">
                <p className="flex items-center gap-2 font-semibold">
                  <span
                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      rank === 0
                        ? "bg-amber-100 text-amber-700 ring-1 ring-amber-300"
                        : rank === 1
                        ? "bg-slate-100 text-slate-800 ring-1 ring-slate-300"
                        : rank === 2
                        ? "bg-amber-50 text-amber-600"
                        : "bg-slate-50 text-slate-500"
                    }`}
                  >
                    {rank + 1}
                  </span>
                  {p.name}
                  <span
                    className={`text-xs text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    ▾
                  </span>
                  <span className="ml-auto sm:ml-3">
                    <FormPills form={formByPlayer[p.player_id] ?? []} />
                  </span>
                </p>
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <StatBar label="3DA" value={p.three_dart_avg} max={80} />
                  <StatBar label="First 9" value={p.first_nine_avg} max={100} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                  Won {p.legs_won}
                </span>
                <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-semibold">
                  Played {p.legs_played}
                </span>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${diffColor}`}>
                  {diffLabel}
                </span>
                {winPct !== null && (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${winPct >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                    {winPct.toFixed(0)}% win
                  </span>
                )}
              </div>
            </button>
            {/* Secondary stats row */}
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-2">
              {p.checkout_pct !== null && (
                <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 text-xs font-semibold">
                  CO {p.checkout_pct.toFixed(0)}%
                </span>
              )}
              {p.darts_per_leg_won !== null && (
                <span className="rounded-full bg-slate-100 text-slate-700 px-3 py-1 text-xs font-semibold">
                  {p.darts_per_leg_won.toFixed(1)} darts/leg
                </span>
              )}
              {p.hundred_plus > 0 && (
                <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 text-xs font-semibold">
                  {p.hundred_plus} × 100+
                </span>
              )}
              {p.hundred_forty_plus > 0 && (
                <span className="rounded-full bg-purple-50 text-purple-700 px-3 py-1 text-xs font-semibold">
                  {p.hundred_forty_plus} × 140+
                </span>
              )}
              {p.one_eighty > 0 && (
                <span className="rounded-full bg-amber-50 text-amber-700 px-3 py-1 text-xs font-semibold">
                  {p.one_eighty} × 180
                </span>
              )}
            </div>

            {/* Game-by-game drill-down */}
            {isOpen && (
              <div className="border-t border-slate-100 pt-3">
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
            )}
          </div>
        );
      })}
    </div>
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
