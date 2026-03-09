import { nanoid } from "nanoid";

export const INITIAL_LIVES = 3;

export type PlayerStatus = "alive" | "eliminated";

export type Player = {
  id: string;
  name: string;
  lives: number;
  status: PlayerStatus;
  turn_order: number;
};

export type GameState =
  | "waiting_for_players"
  | "shuffle_animation"
  | "setting_first_segment"
  | "attack_phase"
  | "segment_setting_phase"
  | "final_proof"
  | "game_over"
  | "rollover";

export type KillerGame = {
  id: string;
  pot: number;
  rollover_pot: number;
  state: GameState;
  current_segment: string | null;
  segment_owner_id: string | null;
  current_player_index: number;
  players: Player[];
  winner_id: string | null;
  darts_thrown_this_turn: number;
};

export function createGame(rollover_pot = 0): KillerGame {
  return {
    id: nanoid(),
    pot: 0,
    rollover_pot,
    state: "waiting_for_players",
    current_segment: null,
    segment_owner_id: null,
    current_player_index: 0,
    players: [],
    winner_id: null,
    darts_thrown_this_turn: 0,
  };
}

export function addPlayer(game: KillerGame, name: string): KillerGame {
  if (game.state !== "waiting_for_players") return game;
  const trimmed = name.trim();
  if (!trimmed) return game;
  if (game.players.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return game;
  const newPlayer: Player = {
    id: nanoid(),
    name: trimmed,
    lives: INITIAL_LIVES,
    status: "alive",
    turn_order: game.players.length,
  };
  const newPlayers = [...game.players, newPlayer];
  return { ...game, players: newPlayers, pot: newPlayers.length };
}

export function removePlayer(game: KillerGame, playerId: string): KillerGame {
  if (game.state !== "waiting_for_players") return game;
  const newPlayers = game.players
    .filter((p) => p.id !== playerId)
    .map((p, i) => ({ ...p, turn_order: i }));
  return { ...game, players: newPlayers, pot: newPlayers.length };
}

function shuffleArray<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function startGame(game: KillerGame): KillerGame {
  if (game.state !== "waiting_for_players") return game;
  if (game.players.length < 2) return game;
  const shuffled = shuffleArray(game.players).map((p, i) => ({
    ...p,
    turn_order: i,
    lives: INITIAL_LIVES,
    status: "alive" as PlayerStatus,
  }));
  return { ...game, players: shuffled, state: "shuffle_animation", current_player_index: 0 };
}

export function continueAfterShuffle(game: KillerGame): KillerGame {
  if (game.state !== "shuffle_animation") return game;
  return { ...game, state: "setting_first_segment", current_player_index: 0, darts_thrown_this_turn: 0 };
}

export function getAlivePlayers(game: KillerGame): Player[] {
  return game.players.filter((p) => p.status === "alive");
}

export function getNextPlayerIndex(
  game: KillerGame,
  fromIndex: number,
  ownerId: string | null
): number {
  const n = game.players.length;
  let next = (fromIndex + 1) % n;
  for (let attempts = 0; attempts < n; attempts++) {
    const p = game.players[next];
    if (p.status === "alive" && p.id !== ownerId) return next;
    next = (next + 1) % n;
  }
  return fromIndex;
}

export function setFirstSegment(game: KillerGame, segment: string): KillerGame {
  if (game.state !== "setting_first_segment") return game;
  const firstPlayer = game.players[0];
  const withOwner = { ...game, segment_owner_id: firstPlayer.id };
  const nextIndex = getNextPlayerIndex(withOwner, 0, firstPlayer.id);
  return {
    ...game,
    current_segment: segment,
    segment_owner_id: firstPlayer.id,
    state: "attack_phase",
    current_player_index: nextIndex,
    darts_thrown_this_turn: 0,
  };
}

export function hitTarget(game: KillerGame): KillerGame {
  if (game.state !== "attack_phase") return game;
  const currentPlayer = game.players[game.current_player_index];
  return {
    ...game,
    state: "segment_setting_phase",
    segment_owner_id: currentPlayer.id,
    darts_thrown_this_turn: 0,
  };
}

function advanceTurn(game: KillerGame): KillerGame {
  const alive = getAlivePlayers(game);
  const ownerId = game.segment_owner_id;
  const nonOwnerAlive = alive.filter((p) => p.id !== ownerId);
  if (nonOwnerAlive.length === 0 && alive.length === 1) {
    const ownerIndex = game.players.findIndex((p) => p.id === ownerId);
    return { ...game, state: "final_proof", current_player_index: ownerIndex, darts_thrown_this_turn: 0 };
  }
  const nextIndex = getNextPlayerIndex(game, game.current_player_index, ownerId);
  return { ...game, current_player_index: nextIndex, darts_thrown_this_turn: 0 };
}

export function missDart(game: KillerGame): KillerGame {
  if (game.state !== "attack_phase") return game;
  const newDartsThrown = game.darts_thrown_this_turn + 1;
  if (newDartsThrown < 3) {
    return { ...game, darts_thrown_this_turn: newDartsThrown };
  }
  const currentPlayer = game.players[game.current_player_index];
  const newLives = currentPlayer.lives - 1;
  const newStatus: PlayerStatus = newLives <= 0 ? "eliminated" : "alive";
  const updatedPlayers = game.players.map((p) =>
    p.id === currentPlayer.id ? { ...p, lives: newLives, status: newStatus } : p
  );
  return advanceTurn({ ...game, players: updatedPlayers, darts_thrown_this_turn: 0 });
}

export function undoDart(game: KillerGame): KillerGame {
  if (game.state !== "attack_phase") return game;
  if (game.darts_thrown_this_turn === 0) return game;
  return { ...game, darts_thrown_this_turn: game.darts_thrown_this_turn - 1 };
}

export function setNewSegment(game: KillerGame, segment: string): KillerGame {
  if (game.state !== "segment_setting_phase") return game;
  const currentPlayer = game.players[game.current_player_index];
  const withOwner = { ...game, segment_owner_id: currentPlayer.id };
  const nextIndex = getNextPlayerIndex(withOwner, game.current_player_index, currentPlayer.id);
  return {
    ...game,
    current_segment: segment,
    segment_owner_id: currentPlayer.id,
    state: "attack_phase",
    current_player_index: nextIndex,
    darts_thrown_this_turn: 0,
  };
}

export function finalProofHit(game: KillerGame): KillerGame {
  if (game.state !== "final_proof") return game;
  return { ...game, state: "game_over", winner_id: game.segment_owner_id };
}

export function finalProofMiss(game: KillerGame): KillerGame {
  if (game.state !== "final_proof") return game;
  const owner = game.players.find((p) => p.id === game.segment_owner_id);
  const allowedDarts = (owner?.lives ?? 1) * 3;
  const newDartsThrown = game.darts_thrown_this_turn + 1;
  if (newDartsThrown < allowedDarts) {
    return { ...game, darts_thrown_this_turn: newDartsThrown };
  }
  return { ...game, state: "rollover", winner_id: null };
}

export function adjustLives(game: KillerGame, playerId: string, delta: number): KillerGame {
  const updatedPlayers = game.players.map((p) => {
    if (p.id !== playerId) return p;
    const newLives = Math.max(0, Math.min(INITIAL_LIVES, p.lives + delta));
    const newStatus: PlayerStatus = newLives <= 0 ? "eliminated" : "alive";
    return { ...p, lives: newLives, status: newStatus };
  });
  return { ...game, players: updatedPlayers };
}

export function skipCurrentPlayer(game: KillerGame): KillerGame {
  if (game.state !== "attack_phase") return game;
  return advanceTurn({ ...game, darts_thrown_this_turn: 0 });
}

export function resetGame(rollover_pot = 0): KillerGame {
  return createGame(rollover_pot);
}
