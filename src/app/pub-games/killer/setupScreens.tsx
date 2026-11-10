"use client";

import { useState, useEffect, useRef } from "react";
import {
  type KillerGame,
  type Player,
  addPlayer,
  removePlayer,
  startGame,
  continueAfterShuffle,
  setFirstSegment,
} from "@/lib/killerEngine";
import { SegmentKeypad } from "./parts";

export function LobbyScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = () => {
    if (!name.trim()) return;
    onUpdate(addPlayer(game, name));
    setName("");
    inputRef.current?.focus();
  };

  const totalPot = game.pot + game.rollover_pot;

  return (
    <div className="flex flex-col gap-4">
      {game.rollover_pot > 0 && (
        <div className="card bg-amber-50 border-amber-200">
          <p className="text-amber-800 text-sm font-semibold">
            Rollover pot: £{game.rollover_pot} carried forward
          </p>
        </div>
      )}

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Players</h2>
          {game.players.length > 0 && (
            <span className="text-sm text-slate-500">Pot: £{totalPot}</span>
          )}
        </div>

        {game.players.length === 0 && (
          <p className="text-slate-400 text-sm text-center py-4">No players yet — add at least 2</p>
        )}

        <div className="flex flex-col gap-1 mb-4">
          {game.players.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 bg-white">
              <span className="font-medium">{p.name}</span>
              <button
                onClick={() => onUpdate(removePlayer(game, p.id))}
                className="text-red-500 text-sm font-semibold px-2 py-1 rounded hover:bg-red-50 active:scale-90"
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Player name"
            maxLength={20}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="rounded-lg bg-slate-200 px-4 py-2.5 font-semibold text-slate-800 hover:bg-slate-300 disabled:opacity-40 active:scale-95"
          >
            Add
          </button>
        </div>
      </div>

      <button
        onClick={() => onUpdate(startGame(game))}
        disabled={game.players.length < 2}
        className="w-full rounded-xl bg-emerald-600 py-5 text-xl font-bold text-white hover:bg-emerald-700 disabled:opacity-40 active:scale-95 transition-transform"
      >
        Start Game
      </button>
    </div>
  );
}

export function ShuffleScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
  const [displayOrder, setDisplayOrder] = useState<Player[]>([...game.players]);
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let count = 0;
    const totalSteps = 14;
    intervalRef.current = setInterval(() => {
      count++;
      if (count >= totalSteps) {
        setDisplayOrder([...game.players].sort((a, b) => a.turn_order - b.turn_order));
        setDone(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        const shuffled = [...game.players].sort(() => Math.random() - 0.5);
        setDisplayOrder(shuffled);
      }
    }, 150);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [game.players]);

  const sorted = [...game.players].sort((a, b) => a.turn_order - b.turn_order);

  return (
    <div className="flex flex-col gap-4">
      <div className="card text-center">
        <h2 className="text-xl font-bold mb-1">Shuffling Order</h2>
        <p className="text-slate-500 text-sm">Randomising turn order…</p>
      </div>

      <div className="card">
        <div className="flex flex-col gap-2">
          {(done ? sorted : displayOrder).map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-all duration-75 ${
                done ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50 border border-slate-200"
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${done ? "bg-emerald-600 text-white" : "bg-slate-300 text-slate-700"}`}>
                {i + 1}
              </span>
              <span className="font-semibold text-lg">{p.name}</span>
              {done && i === 0 && (
                <span className="ml-auto text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-semibold">
                  Sets first segment
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {done && (
        <button
          onClick={() => onUpdate(continueAfterShuffle(game))}
          className="w-full rounded-xl bg-emerald-600 py-5 text-xl font-bold text-white hover:bg-emerald-700 active:scale-95 transition-transform"
        >
          Continue
        </button>
      )}
    </div>
  );
}

export function FirstSegmentScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
  const firstPlayer = game.players[0];
  return (
    <div className="flex flex-col gap-4">
      <div className="card text-center">
        <p className="text-sm text-slate-500 uppercase tracking-wide font-semibold">First Segment</p>
        <h2 className="text-2xl font-bold mt-1">{firstPlayer?.name}</h2>
        <p className="text-slate-500 text-sm mt-1">Throw <strong>left handed</strong> — first segment hit sets the game</p>
      </div>

      <div className="card">
        <SegmentKeypad
          label="Tap the segment hit"
          onSelect={(seg) => onUpdate(setFirstSegment(game, seg))}
        />
      </div>
    </div>
  );
}
