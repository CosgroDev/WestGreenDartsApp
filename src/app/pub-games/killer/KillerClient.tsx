"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  type KillerGame,
  createGame,
  resetGame,
} from "@/lib/killerEngine";
import { LobbyScreen, ShuffleScreen, FirstSegmentScreen } from "./setupScreens";
import { AttackScreen, SegmentSettingScreen, FinalProofScreen, GameOverScreen, RolloverScreen } from "./playScreens";

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
