// Row shapes for the tables the app reads. Written from supabase/migrations;
// fields are optional where queries select a subset of columns. Replace with
// `supabase gen types` output if the project adopts the Supabase CLI.

export type Side = "west_green" | "opponent";

export type PlayerRow = {
  id: string;
  name: string;
  active?: boolean;
  dart_model?: string | null;
  stem_length?: string | null;
  flight_type?: string | null;
};

export type SeasonRef = { id?: string; name?: string };

export type FixtureRef = {
  id?: string;
  opponent?: string;
  home?: boolean;
  starts_at?: string;
  season_id?: string | null;
};

/** PostgREST returns a to-one embed as an object, but the untyped client models it as an array. */
export type Embedded<T> = T | T[] | null | undefined;

export const embedded = <T>(value: Embedded<T>): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

export type GameRow = {
  id: string;
  match_id?: string | null;
  fixture_id: string;
  opponent_player: string;
  west_green_player_id: string | null;
  west_green_starts?: boolean | null;
  winner: Side | null;
  status: string;
  deleted?: boolean | null;
  created_at: string;
  completed_at?: string | null;
  darts_thrown?: number | null;
  revision?: number;
  fixtures?: Embedded<FixtureRef>;
  players?: Embedded<{ name: string }>;
};

/** The columns a fixture list needs from each of its games. */
export type GameStatusRow = Pick<GameRow, "status" | "winner" | "deleted">;

export type EventRow = {
  id: number;
  game_id: string;
  thrower?: string;
  throw_index?: number;
  score: number;
  darts: number;
  remaining_after: number;
  is_bust: boolean;
  is_checkout: boolean;
  is_deleted?: boolean;
  created_at?: string;
};

export type FixtureRow = {
  id: string;
  starts_at: string;
  opponent: string;
  venue: string | null;
  notes: string | null;
  home: boolean;
  season_id?: string | null;
  ai_team_review?: string | null;
  ai_team_review_at?: string | null;
  seasons?: Embedded<SeasonRef>;
  games?: GameStatusRow[];
};

/** A leg as selected by the match pages, which do not always read the fixture or winner. */
export type LegRow = Omit<GameRow, "fixture_id" | "winner"> & { fixture_id?: string; winner?: Side | null };

/** The fixture of a game selected with an inner join, where it is always present. */
export function fixtureOf(game: { fixtures?: Embedded<FixtureRef> }): Required<FixtureRef> {
  const fixture = embedded(game.fixtures);
  if (!fixture) throw new Error("Game row is missing its fixture");
  return fixture as Required<FixtureRef>;
}
