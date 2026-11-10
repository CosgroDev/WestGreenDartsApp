"use client";

import { useState } from "react";
import {
  type KillerGame,
  adjustLives,
  INITIAL_LIVES,
} from "@/lib/killerEngine";

// ── Helpers ──────────────────────────────────────────────────────────────────

export function LivesDisplay({ lives, isEliminated }: { lives: number; isEliminated: boolean }) {
  if (isEliminated) return <span className="text-red-500 font-bold text-lg">✕</span>;
  return (
    <span className="text-base leading-none">
      {Array.from({ length: INITIAL_LIVES }).map((_, i) => (
        <span key={i} className={i < lives ? "text-red-500" : "text-slate-200"}>
          ♥
        </span>
      ))}
    </span>
  );
}

export function DartIndicator({ thrown, total }: { thrown: number; total: number }) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-sm font-bold ${
            i < thrown
              ? "bg-red-500 border-red-600 text-white"
              : "bg-white border-slate-300 text-slate-300"
          }`}
        >
          {i < thrown ? "✕" : "◎"}
        </div>
      ))}
    </div>
  );
}

// ── Segment Keypad ────────────────────────────────────────────────────────────

type Multiplier = "SO" | "SI" | "D" | "T";

const MULTIPLIER_OPTIONS: { value: Multiplier; label: string; sub: string; style: string; activeStyle: string }[] = [
  { value: "SO", label: "S", sub: "big",   style: "bg-slate-100 text-slate-800 border-2 border-slate-200", activeStyle: "bg-emerald-600 text-white border-2 border-emerald-700" },
  { value: "SI", label: "S", sub: "small", style: "bg-slate-100 text-slate-800 border-2 border-slate-200", activeStyle: "bg-emerald-600 text-white border-2 border-emerald-700" },
  { value: "D",  label: "D", sub: "double", style: "bg-blue-50 text-blue-800 border-2 border-blue-200",   activeStyle: "bg-blue-600 text-white border-2 border-blue-700" },
  { value: "T",  label: "T", sub: "treble", style: "bg-purple-50 text-purple-800 border-2 border-purple-200", activeStyle: "bg-purple-600 text-white border-2 border-purple-700" },
];

export function SegmentKeypad({ onSelect, label }: { onSelect: (seg: string) => void; label: string }) {
  const [multiplier, setMultiplier] = useState<Multiplier | null>(null);

  const handleNumber = (n: number | "25" | "BULL") => {
    if (n === "25") { onSelect("25"); setMultiplier(null); return; }
    if (n === "BULL") { onSelect("BULL"); setMultiplier(null); return; }
    if (!multiplier) return;
    onSelect(`${multiplier}${n}`);
    setMultiplier(null);
  };

  const btnBase =
    "flex items-center justify-center rounded-lg font-bold active:scale-95 transition-transform select-none touch-manipulation";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-slate-500 font-medium">{label}</p>

      {/* Step 1: Multiplier row */}
      <div className="grid grid-cols-3 gap-2">
        {MULTIPLIER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setMultiplier(opt.value)}
            className={`${btnBase} flex-col h-14 text-lg leading-none ${
              multiplier === opt.value ? opt.activeStyle : opt.style
            }`}
          >
            <span className="text-xl font-black">{opt.label}</span>
            <span className="text-[10px] font-medium opacity-70">{opt.sub}</span>
          </button>
        ))}
        <button
          onClick={() => handleNumber("25")}
          className={`${btnBase} flex-col h-14 bg-amber-100 text-amber-800 border-2 border-amber-200`}
        >
          <span className="text-xl font-black">25</span>
          <span className="text-[10px] font-medium opacity-70">outer bull</span>
        </button>
        <button
          onClick={() => handleNumber("BULL")}
          className={`${btnBase} flex-col h-14 bg-red-100 text-red-800 border-2 border-red-200`}
        >
          <span className="text-xl font-black">BULL</span>
          <span className="text-[10px] font-medium opacity-70">bullseye</span>
        </button>
      </div>

      {/* Step 2: Number grid — only shown when multiplier selected */}
      {multiplier && (
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => handleNumber(n)}
              className={`${btnBase} h-12 text-base bg-white border-2 border-slate-200 text-slate-800 hover:bg-slate-50`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {!multiplier && (
        <p className="text-center text-sm text-slate-400 italic">Select a segment type above</p>
      )}
    </div>
  );
}

// ── Player List ───────────────────────────────────────────────────────────────

export function PlayerList({
  game,
  onUpdate,
  showAdmin,
}: {
  game: KillerGame;
  onUpdate: (g: KillerGame) => void;
  showAdmin: boolean;
}) {
  const sorted = [...game.players].sort((a, b) => a.turn_order - b.turn_order);
  const currentPlayer =
    game.state !== "waiting_for_players" && game.state !== "shuffle_animation" && game.state !== "game_over" && game.state !== "rollover"
      ? game.players[game.current_player_index]
      : null;

  return (
    <div className="flex flex-col gap-1">
      {sorted.map((p) => {
        const isOwner = p.id === game.segment_owner_id;
        const isCurrent = p.id === currentPlayer?.id;
        const isEliminated = p.status === "eliminated";
        return (
          <div
            key={p.id}
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
              isEliminated
                ? "bg-slate-50 border-slate-100 opacity-50"
                : isCurrent
                ? "bg-emerald-50 border-emerald-300"
                : isOwner
                ? "bg-amber-50 border-amber-200"
                : "bg-white border-slate-200"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className={`text-base font-semibold truncate ${isEliminated ? "line-through text-slate-400" : ""}`}>
                {isCurrent && <span className="text-emerald-600 mr-1">▶</span>}
                {p.name}
              </span>
              {isOwner && !isEliminated && (
                <span className="text-xs bg-amber-200 text-amber-800 rounded-full px-2 py-0.5 font-semibold shrink-0">
                  OWNER
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <LivesDisplay lives={p.lives} isEliminated={isEliminated} />
              {showAdmin && game.state !== "waiting_for_players" && !isEliminated && (
                <div className="flex gap-1 ml-2">
                  <button
                    onClick={() => onUpdate(adjustLives(game, p.id, -1))}
                    className="w-7 h-7 rounded bg-red-100 text-red-700 font-bold text-sm flex items-center justify-center active:scale-90"
                  >
                    −
                  </button>
                  <button
                    onClick={() => onUpdate(adjustLives(game, p.id, +1))}
                    className="w-7 h-7 rounded bg-emerald-100 text-emerald-700 font-bold text-sm flex items-center justify-center active:scale-90"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
