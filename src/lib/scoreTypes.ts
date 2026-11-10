import type { Side } from "./dbRows";

// Shapes that cross the server-action boundary for league scoring.

/** A visit as stored: one row of scoring_events. */
export type ScoreEvent = {
  id?: number;
  thrower?: string;
  score: number;
  darts: number;
  remaining_after: number;
  is_bust: boolean;
  is_checkout: boolean;
};

export type CommandFailure = { ok: false; message: string };

/** What wgd_score_snapshot returns, and the `state` of wgd_score_command_state. */
export type RawSnapshot = {
  meta: RawGameMeta;
  events?: ScoreEvent[];
  completedLegs?: { id: string; winner: Side | null; events: ScoreEvent[] }[];
};

export type RawGameMeta = {
  id: string;
  fixture_id: string;
  status: string;
  winner: Side | null;
  darts_thrown?: number | null;
  opponent_player: string;
  west_green_player_id: string | null;
  match_id: string | null;
  revision: number;
  west_green_starts: boolean;
  players?: { name: string } | null;
  legs?: { west: number; opp: number };
  nextGameId?: string;
};

export type ScoringSide = "west" | "opponent";

export type LeagueGameMeta = RawGameMeta & {
  opponentRemaining: number;
  activeSide: ScoringSide;
  throwLog: ScoringSide[];
};

export type LegSummaryWire = {
  winner: ScoringSide;
  dartsTotal: number;
  pointsTotal: number;
  firstNine: number | null;
  firstNinePoints: number | null;
  firstNineDarts: number | null;
  buckets: Record<string, number>;
  gameId: string;
};

/** The state a league scoring screen renders. */
export type LeagueState = {
  ok: true;
  visits: ScoreEvent[];
  remaining: number;
  finishHint: string | null;
  meta: LeagueGameMeta | null;
  completedLegs?: RawSnapshot["completedLegs"];
  summaries?: LegSummaryWire[];
};

export type LeagueResult = LeagueState | CommandFailure;

/** Result of wgd_score_command / wgd_score_command_state. */
export type CommandResult =
  | { ok: true; state?: RawSnapshot; next_game_id?: string; undidThrower?: string }
  | CommandFailure;
