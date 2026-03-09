"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  KillerGame,
  Player,
  createGame,
  addPlayer,
  removePlayer,
  startGame,
  continueAfterShuffle,
  setFirstSegment,
  hitTarget,
  missDart,
  undoDart,
  setNewSegment,
  finalProofHit,
  finalProofMiss,
  adjustLives,
  skipCurrentPlayer,
  resetGame,
  getAlivePlayers,
  INITIAL_LIVES,
} from "@/lib/killerEngine";

const STORAGE_KEY = "wgd_killer_game";

function loadGame(): KillerGame | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as KillerGame;
  } catch {
    return null;
  }
}

function saveGame(game: KillerGame): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {
    // ignore storage errors
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function LivesDisplay({ lives, isEliminated }: { lives: number; isEliminated: boolean }) {
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

function DartIndicator({ thrown, total }: { thrown: number; total: number }) {
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

function SegmentKeypad({ onSelect, label }: { onSelect: (seg: string) => void; label: string }) {
  const [multiplier, setMultiplier] = useState<"S" | "D" | "T" | null>(null);

  const handleMultiplier = (m: "S" | "D" | "T") => setMultiplier(m);

  const handleNumber = (n: number | "25" | "BULL") => {
    if (n === "25") { onSelect("25"); setMultiplier(null); return; }
    if (n === "BULL") { onSelect("BULL"); setMultiplier(null); return; }
    if (!multiplier) return;
    onSelect(`${multiplier}${n}`);
    setMultiplier(null);
  };

  const btnBase =
    "flex items-center justify-center rounded-lg font-bold text-lg active:scale-95 transition-transform select-none touch-manipulation";

  return (
    <div className="flex flex-col gap-3">
      <p className="text-center text-sm text-slate-500 font-medium">{label}</p>

      {/* Step 1: Multiplier */}
      <div className="flex gap-2">
        {(["S", "D", "T"] as const).map((m) => (
          <button
            key={m}
            onClick={() => handleMultiplier(m)}
            className={`${btnBase} flex-1 h-14 text-xl ${
              multiplier === m
                ? "bg-emerald-600 text-white border-2 border-emerald-700"
                : "bg-slate-100 text-slate-800 border-2 border-slate-200"
            }`}
          >
            {m}
          </button>
        ))}
        <button
          onClick={() => handleNumber("25")}
          className={`${btnBase} flex-1 h-14 bg-amber-100 text-amber-800 border-2 border-amber-200`}
        >
          25
        </button>
        <button
          onClick={() => handleNumber("BULL")}
          className={`${btnBase} flex-1 h-14 bg-red-100 text-red-800 border-2 border-red-200`}
        >
          BULL
        </button>
      </div>

      {/* Step 2: Number grid — only shown when multiplier selected */}
      {multiplier && (
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => handleNumber(n)}
              className={`${btnBase} h-12 bg-white border-2 border-slate-200 text-slate-800 hover:bg-slate-50`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {!multiplier && (
        <p className="text-center text-sm text-slate-400 italic">Select a multiplier above, or tap 25 / BULL directly</p>
      )}
    </div>
  );
}

// ── Player List ───────────────────────────────────────────────────────────────

function PlayerList({
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

// ── Screens ───────────────────────────────────────────────────────────────────

function LobbyScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
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

function ShuffleScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
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

function FirstSegmentScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
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

function AttackScreen({
  game,
  onUpdate,
  showAdmin,
  onToggleAdmin,
}: {
  game: KillerGame;
  onUpdate: (g: KillerGame) => void;
  showAdmin: boolean;
  onToggleAdmin: () => void;
}) {
  const currentPlayer = game.players[game.current_player_index];
  const owner = game.players.find((p) => p.id === game.segment_owner_id);
  const dartsLeft = 3 - game.darts_thrown_this_turn;

  return (
    <div className="flex flex-col gap-3">
      {/* Info bar */}
      <div className="card">
        <div className="grid grid-cols-2 gap-2 text-center text-sm">
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide">Target</p>
            <p className="text-3xl font-black text-emerald-700 leading-none mt-0.5">{game.current_segment}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide">Owner</p>
            <p className="text-lg font-bold leading-none mt-0.5">{owner?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide">Pot</p>
            <p className="text-lg font-bold leading-none mt-0.5">£{game.pot + game.rollover_pot}</p>
          </div>
          <div>
            <p className="text-slate-500 text-xs uppercase tracking-wide">Alive</p>
            <p className="text-lg font-bold leading-none mt-0.5">{getAlivePlayers(game).length}</p>
          </div>
        </div>
      </div>

      {/* Player list */}
      <div className="card">
        <PlayerList game={game} onUpdate={onUpdate} showAdmin={showAdmin} />
      </div>

      {/* Current player + darts */}
      <div className="card bg-emerald-50 border-emerald-200 text-center">
        <p className="text-xs text-emerald-600 uppercase tracking-wide font-semibold">Now throwing</p>
        <p className="text-2xl font-black text-emerald-800 mt-0.5">{currentPlayer?.name}</p>
        <div className="mt-2">
          <DartIndicator thrown={game.darts_thrown_this_turn} total={3} />
        </div>
        <p className="text-sm text-emerald-600 mt-1">{dartsLeft} dart{dartsLeft !== 1 ? "s" : ""} remaining</p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => onUpdate(hitTarget(game))}
          className="w-full rounded-xl bg-emerald-600 py-5 text-xl font-bold text-white hover:bg-emerald-700 active:scale-95 transition-transform"
        >
          HIT TARGET
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => onUpdate(missDart(game))}
            className="rounded-xl bg-red-500 py-4 text-lg font-bold text-white hover:bg-red-600 active:scale-95 transition-transform"
          >
            MISS
          </button>
          <button
            onClick={() => onUpdate(undoDart(game))}
            disabled={game.darts_thrown_this_turn === 0}
            className="rounded-xl bg-slate-200 py-4 text-lg font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-40 active:scale-95 transition-transform"
          >
            UNDO
          </button>
        </div>
      </div>

      {/* Admin controls */}
      <div className="card border-dashed border-slate-300">
        <button onClick={onToggleAdmin} className="w-full text-sm text-slate-500 flex items-center justify-between">
          <span>Admin controls</span>
          <span>{showAdmin ? "▲" : "▼"}</span>
        </button>
        {showAdmin && (
          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={() => onUpdate(skipCurrentPlayer(game))}
              className="w-full rounded-lg bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Skip current player
            </button>
            <button
              onClick={() => { if (confirm("Reset game?")) onUpdate(resetGame(game.rollover_pot)); }}
              className="w-full rounded-lg bg-red-100 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-200"
            >
              Reset game
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SegmentSettingScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
  const currentPlayer = game.players[game.current_player_index];
  const owner = game.players.find((p) => p.id === game.segment_owner_id);

  return (
    <div className="flex flex-col gap-4">
      <div className="card text-center">
        <p className="text-sm text-slate-500 uppercase tracking-wide font-semibold">Segment Setting</p>
        <h2 className="text-2xl font-bold mt-1">{currentPlayer?.name ?? owner?.name}</h2>
        <p className="text-slate-500 text-sm mt-1">
          You hit <strong>{game.current_segment}</strong>! Now set the next target with 2 darts.
        </p>
      </div>

      <div className="card">
        <PlayerList game={game} onUpdate={onUpdate} showAdmin={false} />
      </div>

      <div className="card">
        <SegmentKeypad
          label="Tap the segment you hit to set as new target"
          onSelect={(seg) => onUpdate(setNewSegment(game, seg))}
        />
      </div>
    </div>
  );
}

function FinalProofScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
  const owner = game.players.find((p) => p.id === game.segment_owner_id);
  const allowedDarts = (owner?.lives ?? 1) * 3;
  const dartsLeft = allowedDarts - game.darts_thrown_this_turn;

  return (
    <div className="flex flex-col gap-4">
      <div className="card bg-amber-50 border-amber-300 text-center">
        <p className="text-sm text-amber-700 uppercase tracking-wide font-semibold">Final Proof</p>
        <h2 className="text-2xl font-bold mt-1 text-amber-900">{owner?.name}</h2>
        <p className="text-amber-700 text-sm mt-1">
          Must prove <strong>{game.current_segment}</strong> with {allowedDarts} dart{allowedDarts !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="card">
        <PlayerList game={game} onUpdate={onUpdate} showAdmin={false} />
      </div>

      <div className="card bg-amber-50 border-amber-200 text-center">
        <div className="mt-1">
          <DartIndicator thrown={game.darts_thrown_this_turn} total={allowedDarts} />
        </div>
        <p className="text-sm text-amber-700 mt-2">{dartsLeft} dart{dartsLeft !== 1 ? "s" : ""} remaining</p>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => onUpdate(finalProofHit(game))}
          className="w-full rounded-xl bg-emerald-600 py-5 text-xl font-bold text-white hover:bg-emerald-700 active:scale-95 transition-transform"
        >
          HIT — WIN!
        </button>
        <button
          onClick={() => onUpdate(finalProofMiss(game))}
          className="w-full rounded-xl bg-red-500 py-4 text-xl font-bold text-white hover:bg-red-600 active:scale-95 transition-transform"
        >
          MISS
        </button>
      </div>
    </div>
  );
}

function GameOverScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
  const winner = game.players.find((p) => p.id === game.winner_id);
  const totalPot = game.pot + game.rollover_pot;

  return (
    <div className="flex flex-col gap-4 items-center text-center">
      <div className="card w-full">
        <p className="text-4xl mb-2">🎯</p>
        <h2 className="text-3xl font-black text-emerald-700">Winner!</h2>
        <p className="text-2xl font-bold mt-2">{winner?.name ?? "Unknown"}</p>
        <p className="text-slate-500 mt-1 text-sm">Proved <strong>{game.current_segment}</strong></p>
        <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 py-4">
          <p className="text-sm text-emerald-600 uppercase tracking-wide font-semibold">Pot won</p>
          <p className="text-4xl font-black text-emerald-700 mt-1">£{totalPot}</p>
        </div>
      </div>

      <div className="card w-full">
        <h3 className="text-base font-semibold mb-3">Final standings</h3>
        <PlayerList game={game} onUpdate={onUpdate} showAdmin={false} />
      </div>

      <button
        onClick={() => onUpdate(resetGame(0))}
        className="w-full rounded-xl bg-emerald-600 py-5 text-xl font-bold text-white hover:bg-emerald-700 active:scale-95 transition-transform"
      >
        New Game
      </button>
    </div>
  );
}

function RolloverScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
  const owner = game.players.find((p) => p.id === game.segment_owner_id);
  const totalPot = game.pot + game.rollover_pot;

  return (
    <div className="flex flex-col gap-4 items-center text-center">
      <div className="card w-full">
        <p className="text-4xl mb-2">🔄</p>
        <h2 className="text-3xl font-black text-amber-600">Rollover!</h2>
        <p className="text-slate-600 mt-1">
          {owner?.name} missed the proof on <strong>{game.current_segment}</strong>
        </p>
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 py-4">
          <p className="text-sm text-amber-600 uppercase tracking-wide font-semibold">Pot carries over</p>
          <p className="text-4xl font-black text-amber-700 mt-1">£{totalPot}</p>
          <p className="text-sm text-amber-600 mt-1">Plus £1 per new player who re-enrols</p>
        </div>
      </div>

      <button
        onClick={() => onUpdate(resetGame(totalPot))}
        className="w-full rounded-xl bg-amber-500 py-5 text-xl font-bold text-white hover:bg-amber-600 active:scale-95 transition-transform"
      >
        Re-enrol Players (£{totalPot + 1}+ pot)
      </button>
      <button
        onClick={() => onUpdate(resetGame(0))}
        className="w-full rounded-xl bg-slate-200 py-4 text-base font-semibold text-slate-700 hover:bg-slate-300 active:scale-95 transition-transform"
      >
        Start Fresh (clear pot)
      </button>
    </div>
  );
}

// ── Root Component ────────────────────────────────────────────────────────────

export function KillerClient() {
  const [game, setGame] = useState<KillerGame | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    const saved = loadGame();
    setGame(saved ?? createGame());
  }, []);

  const update = useCallback((newGame: KillerGame) => {
    setGame(newGame);
    saveGame(newGame);
  }, []);

  if (!game) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <p className="text-slate-400">Loading…</p>
      </main>
    );
  }

  const renderScreen = () => {
    switch (game.state) {
      case "waiting_for_players":
        return <LobbyScreen game={game} onUpdate={update} />;
      case "shuffle_animation":
        return <ShuffleScreen game={game} onUpdate={update} />;
      case "setting_first_segment":
        return <FirstSegmentScreen game={game} onUpdate={update} />;
      case "attack_phase":
        return (
          <AttackScreen
            game={game}
            onUpdate={update}
            showAdmin={showAdmin}
            onToggleAdmin={() => setShowAdmin((v) => !v)}
          />
        );
      case "segment_setting_phase":
        return <SegmentSettingScreen game={game} onUpdate={update} />;
      case "final_proof":
        return <FinalProofScreen game={game} onUpdate={update} />;
      case "game_over":
        return <GameOverScreen game={game} onUpdate={update} />;
      case "rollover":
        return <RolloverScreen game={game} onUpdate={update} />;
    }
  };

  const isInGame =
    game.state !== "waiting_for_players" &&
    game.state !== "game_over" &&
    game.state !== "rollover";

  return (
    <main className="flex flex-col gap-4 pb-8">
      <header className="card">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Pub Games</p>
            <h1 className="text-2xl font-bold">Killer</h1>
          </div>
          <div className="flex items-center gap-2">
            {isInGame && (
              <button
                onClick={() => { if (confirm("Reset to lobby?")) { update(resetGame(0)); setShowAdmin(false); } }}
                className="text-xs text-slate-500 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"
              >
                Reset
              </button>
            )}
            <Link
              href="/dashboard"
              className="text-xs text-slate-500 border border-slate-200 rounded px-2 py-1 hover:bg-slate-50"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
      </header>

      {renderScreen()}
    </main>
  );
}
