"use client";

import {
  type KillerGame,
  hitTarget,
  missDart,
  undoDart,
  setNewSegment,
  finalProofHit,
  finalProofMiss,
  skipCurrentPlayer,
  resetGame,
  getAlivePlayers,
} from "@/lib/killerEngine";
import { DartIndicator, SegmentKeypad, PlayerList } from "./parts";

export function AttackScreen({
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

export function SegmentSettingScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
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

export function FinalProofScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
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

export function GameOverScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
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

export function RolloverScreen({ game, onUpdate }: { game: KillerGame; onUpdate: (g: KillerGame) => void }) {
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

