import { type EventRow, type LegRow, embedded } from "@/lib/dbRows";
import { allRows } from "@/lib/database";
import { canFinishFrom } from "@/lib/scoringUtils";
import { supabaseServer } from "@/lib/supabaseServer";

export type Visit = {
  score: number;
  darts: number;
  remainingAfter: number;
  isBust: boolean;
  isCheckout: boolean;
  /** What the other player had left when this visit began (absent if their visits weren't recorded). */
  otherLeft?: number;
  /** Position of this visit in the leg's throw order across both players. */
  seq?: number;
};

/** One side's numbers for a leg, worked out from that side's visits alone. */
export type SideStats = {
  dartsTotal: number;
  pointsTotal: number;
  threeDartAvg: number | null;
  firstNineAvg: number | null;
  checkoutAttempts: number;
  checkoutHits: number;
  highFinish: number | null;
  busts: number;
  bands: { sixtyPlus: number; eightyPlus: number; hundredPlus: number; oneFortyPlus: number; oneEighty: number; twentySix: number };
};

export type LegSummary = {
  gameId: string;
  winner: "west" | "opponent" | "draw";
  visits: Visit[];
  dartsTotal: number;
  pointsTotal: number;
  threeDartAvg: number | null;
  firstNineAvg: number | null;
  checkoutAttempts: number;
  checkoutHits: number;
  highFinish: number | null;
  busts: number;
  bands: { sixtyPlus: number; eightyPlus: number; hundredPlus: number; oneFortyPlus: number; oneEighty: number; twentySix: number };
  /** The opponent's visits in this leg. Empty or absent when they weren't recorded. */
  opponentVisits?: Visit[];
  /** True when the West Green player threw first in the leg (null/absent if unknown). */
  westStarted?: boolean | null;
};

export type MatchSummary = {
  fixtureId: string;
  fixtureLabel: string;
  /** Season the fixture belongs to — used to pull the player's season baseline. */
  seasonId?: string | null;
  westPlayerId?: string | null;
  westPlayerName: string;
  opponentPlayer: string;
  westLegs: number;
  oppLegs: number;
  result: "win" | "loss" | "draw";
  legs: LegSummary[];
  // match-level aggregates for the West Green player; the opponent's visits are on each leg
  dartsTotal: number;
  pointsTotal: number;
  threeDartAvg: number | null;
  firstNineAvg: number | null;
  checkoutAttempts: number;
  checkoutHits: number;
  checkoutPct: number | null;
  highFinish: number | null;
  bestLegDarts: number | null;
  busts: number;
  bands: LegSummary["bands"];
  /** The opponent's side of the match; null when none of their visits were recorded. */
  opponent: OpponentMatchStats | null;
};

export type OpponentMatchStats = SideStats & {
  /** Legs of the match that have opponent visits. */
  legsWithVisits: number;
  checkoutPct: number | null;
  /** Fewest darts in a leg the opponent won. */
  bestLegDarts: number | null;
  /** The West Green player's average over the same legs, for a like-for-like comparison. */
  playerThreeDartAvg: number | null;
};

/** The opponent's match-level numbers, from the legs where their visits were recorded. */
export function summariseOpponent(legs: LegSummary[]): OpponentMatchStats | null {
  const withVisits = legs.filter((l) => (l.opponentVisits ?? []).length > 0);
  if (!withVisits.length) return null;
  const all = summariseVisits(withVisits.flatMap((l) => l.opponentVisits ?? []));
  const perLeg = withVisits.map((l) => summariseVisits(l.opponentVisits ?? []));
  const firstNines = perLeg.map((l) => l.firstNineAvg).filter((a): a is number => a !== null);
  const wonDarts = withVisits
    .map((l, i) => (l.winner === "opponent" ? perLeg[i].dartsTotal : 0))
    .filter((d) => d > 0);
  const ownDarts = withVisits.reduce((s, l) => s + l.dartsTotal, 0);
  const ownPoints = withVisits.reduce((s, l) => s + l.pointsTotal, 0);
  return {
    ...all,
    // Mean of the leg first-nines, the same way the player's is worked out.
    firstNineAvg: firstNines.length ? firstNines.reduce((s, a) => s + a, 0) / firstNines.length : null,
    legsWithVisits: withVisits.length,
    checkoutPct: all.checkoutAttempts > 0 ? (all.checkoutHits / all.checkoutAttempts) * 100 : null,
    bestLegDarts: wonDarts.length ? Math.min(...wonDarts) : null,
    playerThreeDartAvg: ownDarts > 0 ? (ownPoints / ownDarts) * 3 : null
  };
}

export function summariseVisits(visits: Visit[]): SideStats {
  const dartsTotal = visits.reduce((s, v) => s + v.darts, 0);
  const pointsTotal = visits.reduce((s, v) => s + (v.isBust ? 0 : v.score), 0);
  const firstThree = visits.slice(0, 3);
  const f9Darts = firstThree.reduce((s, v) => s + v.darts, 0);
  const f9Points = firstThree.reduce((s, v) => s + (v.isBust ? 0 : v.score), 0);
  let checkoutAttempts = 0;
  let checkoutHits = 0;
  let highFinish: number | null = null;
  const bands = { sixtyPlus: 0, eightyPlus: 0, hundredPlus: 0, oneFortyPlus: 0, oneEighty: 0, twentySix: 0 };
  visits.forEach((v) => {
    // a visit that started on a finishable number counts as a checkout attempt
    const remainingBefore = v.isBust ? v.remainingAfter : v.remainingAfter + v.score;
    if (canFinishFrom(remainingBefore)) {
      checkoutAttempts += 1;
      if (v.isCheckout) checkoutHits += 1;
    }
    if (v.isCheckout) highFinish = highFinish === null ? v.score : Math.max(highFinish, v.score);
    if (v.isBust) return;
    if (v.score === 26) bands.twentySix += 1;
    if (v.score >= 60) bands.sixtyPlus += 1;
    if (v.score >= 80) bands.eightyPlus += 1;
    if (v.score >= 100) bands.hundredPlus += 1;
    if (v.score >= 140) bands.oneFortyPlus += 1;
    if (v.score === 180) bands.oneEighty += 1;
  });
  return {
    dartsTotal,
    pointsTotal,
    threeDartAvg: dartsTotal > 0 ? (pointsTotal / dartsTotal) * 3 : null,
    firstNineAvg: f9Darts === 9 ? (f9Points / f9Darts) * 3 : null,
    checkoutAttempts,
    checkoutHits,
    highFinish,
    busts: visits.filter((v) => v.isBust).length,
    bands
  };
}

export function summariseLeg(
  gameId: string,
  winner: LegSummary["winner"],
  visits: Visit[],
  extra: { opponentVisits?: Visit[]; westStarted?: boolean | null } = {}
): LegSummary {
  return { gameId, winner, visits, ...summariseVisits(visits), ...extra };
}

/**
 * Split one leg's events (both throwers, in throw order) into each side's
 * visits. Every visit carries what the other player had left when it began,
 * which is what turns a list of scores into the story of a race.
 */
export function splitLegEvents(events: EventRow[], startScore = 501) {
  const west: Visit[] = [];
  const opponent: Visit[] = [];
  let westLeft = startScore;
  let oppLeft = startScore;
  events.forEach((e, seq) => {
    const isOpponent = e.thrower === "opponent";
    const remainingAfter = typeof e.remaining_after === "number" ? e.remaining_after : 0;
    const visit: Visit = {
      score: typeof e.score === "number" ? e.score : 0,
      darts: typeof e.darts === "number" ? e.darts : 3,
      remainingAfter,
      isBust: e.is_bust === true,
      isCheckout: e.is_checkout === true,
      otherLeft: isOpponent ? westLeft : oppLeft,
      seq
    };
    if (isOpponent) {
      opponent.push(visit);
      oppLeft = remainingAfter;
    } else {
      west.push(visit);
      westLeft = remainingAfter;
    }
  });
  // Without any opponent visits the "other player" numbers mean nothing.
  if (!opponent.length) west.forEach((v) => delete v.otherLeft);
  const westStarted = opponent.length && events.length ? events[0].thrower !== "opponent" : null;
  return { west, opponent, westStarted };
}

/**
 * Full summary for a completed match. `gameId` may be any leg of the match;
 * the match is the group of game (leg) records sharing a match_id (or, for
 * legacy rows, fixture + player + opponent), mirroring the fixture page.
 */
export async function getMatchSummary(gameId: string): Promise<MatchSummary | null> {
  const supabase = await supabaseServer();
  if (!supabase) return null;

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, fixture_id, west_green_player_id, opponent_player, match_id, players(name)")
    .eq("id", gameId)
    .single();
  if (gameErr || !game) return null;

  const [{ data: fixture }, { data: siblings, error: sibErr }] = await Promise.all([
    supabase.from("fixtures").select("id, opponent, home, season_id").eq("id", game.fixture_id).single(),
    supabase
      .from("games")
      .select("id, match_id, opponent_player, west_green_player_id, west_green_starts, winner, status, created_at")
      .eq("fixture_id", game.fixture_id)
      .eq("deleted", false)
      .order("created_at", { ascending: true })
  ]);
  if (sibErr || !siblings) return null;

  const oppKey = (game.opponent_player || "").trim().toLowerCase();
  const legsGames = siblings.filter(
    (g: LegRow) =>
      (game.match_id
        ? g.match_id === game.match_id
        : g.west_green_player_id === game.west_green_player_id &&
          (g.opponent_player || "").trim().toLowerCase() === oppKey) &&
      g.status === "completed"
  );
  if (!legsGames.length) return null;

  // Both throwers, in throw order: the opponent's visits are what show whether
  // a leg was lost to better scoring or thrown away on the finish.
  const { data: events } = await allRows(() => supabase
    .from("scoring_events")
    .select("game_id, thrower, score, darts, remaining_after, is_bust, is_checkout, throw_index")
    .in("game_id", legsGames.map((g: LegRow) => g.id))
    .eq("is_deleted", false)
    .order("throw_index", { ascending: true }).order("id", { ascending: true }));

  const eventsByGame = new Map<string, EventRow[]>();
  (events || []).forEach((e: EventRow) => {
    eventsByGame.set(e.game_id, [...(eventsByGame.get(e.game_id) || []), e]);
  });

  const legs: LegSummary[] = legsGames.map((g: LegRow) => {
    const split = splitLegEvents(eventsByGame.get(g.id) || []);
    return summariseLeg(
      g.id,
      g.winner === "west_green" ? "west" : g.winner === "opponent" ? "opponent" : "draw",
      split.west,
      {
        opponentVisits: split.opponent,
        westStarted: split.westStarted ?? (typeof g.west_green_starts === "boolean" ? g.west_green_starts : null)
      }
    );
  });

  const westLegs = legs.filter((l) => l.winner === "west").length;
  const oppLegs = legs.filter((l) => l.winner === "opponent").length;
  const isDraw = legs.some((l) => l.winner === "draw") || westLegs === oppLegs;
  const result: MatchSummary["result"] = isDraw ? "draw" : westLegs > oppLegs ? "win" : "loss";

  const dartsTotal = legs.reduce((s, l) => s + l.dartsTotal, 0);
  const pointsTotal = legs.reduce((s, l) => s + l.pointsTotal, 0);
  const checkoutAttempts = legs.reduce((s, l) => s + l.checkoutAttempts, 0);
  const checkoutHits = legs.reduce((s, l) => s + l.checkoutHits, 0);
  const f9 = legs.filter((l) => l.firstNineAvg !== null);
  const highFinish = legs.reduce<number | null>((max, l) => {
    if (l.highFinish === null) return max;
    return max === null ? l.highFinish : Math.max(max, l.highFinish);
  }, null);
  const bestLegDarts = legs
    .filter((l) => l.winner === "west" && l.dartsTotal > 0)
    .reduce<number | null>((min, l) => (min === null ? l.dartsTotal : Math.min(min, l.dartsTotal)), null);
  const bands = legs.reduce(
    (acc, l) => ({
      sixtyPlus: acc.sixtyPlus + l.bands.sixtyPlus,
      eightyPlus: acc.eightyPlus + l.bands.eightyPlus,
      hundredPlus: acc.hundredPlus + l.bands.hundredPlus,
      oneFortyPlus: acc.oneFortyPlus + l.bands.oneFortyPlus,
      oneEighty: acc.oneEighty + l.bands.oneEighty,
      twentySix: acc.twentySix + l.bands.twentySix
    }),
    { sixtyPlus: 0, eightyPlus: 0, hundredPlus: 0, oneFortyPlus: 0, oneEighty: 0, twentySix: 0 }
  );

  return {
    fixtureId: game.fixture_id,
    fixtureLabel: fixture ? `${fixture.home ? "Home vs" : "Away @"} ${fixture.opponent}` : "Fixture",
    seasonId: fixture?.season_id ?? null,
    westPlayerId: game.west_green_player_id ?? null,
    westPlayerName: embedded(game.players)?.name ?? "West Green",
    opponentPlayer: game.opponent_player || "Opponent",
    westLegs: isDraw && westLegs === 0 && oppLegs === 0 ? 1 : westLegs,
    oppLegs: isDraw && westLegs === 0 && oppLegs === 0 ? 1 : oppLegs,
    result,
    legs,
    dartsTotal,
    pointsTotal,
    threeDartAvg: dartsTotal > 0 ? (pointsTotal / dartsTotal) * 3 : null,
    firstNineAvg: f9.length ? f9.reduce((s, l) => s + (l.firstNineAvg ?? 0), 0) / f9.length : null,
    checkoutAttempts,
    checkoutHits,
    checkoutPct: checkoutAttempts > 0 ? (checkoutHits / checkoutAttempts) * 100 : null,
    highFinish,
    bestLegDarts,
    busts: legs.reduce((s, l) => s + l.busts, 0),
    bands,
    opponent: summariseOpponent(legs)
  };
}

// The match review is the same story every time — a completed match never
// changes — so it's generated once and stored against the match's game row.
// Read defensively (separate from getMatchSummary) so the match page still
// renders if the ai_review column hasn't been migrated yet.
export async function getMatchAiReview(
  gameId: string
): Promise<{ review: string | null; reviewAt: string | null }> {
  const supabase = await supabaseServer();
  if (!supabase) return { review: null, reviewAt: null };

  const { data, error } = await supabase
    .from("games")
    .select("ai_review, ai_review_at")
    .eq("id", gameId)
    .single();
  if (error || !data) return { review: null, reviewAt: null };

  return {
    review: data.ai_review ?? null,
    reviewAt: data.ai_review_at ?? null
  };
}

export type TeamMatchSummary = {
  westPlayerId: string | null;
  westPlayerName: string;
  opponentPlayer: string;
  result: "win" | "loss" | "draw";
  westLegs: number;
  oppLegs: number;
  threeDartAvg: number | null;
  firstNineAvg: number | null;
  checkoutHits: number;
  checkoutAttempts: number;
  checkoutPct: number | null;
  highFinish: number | null;
  bestLegDarts: number | null;
  busts: number;
  bands: LegSummary["bands"];
  legs: LegSummary[];
  opponent: OpponentMatchStats | null;
};

export type FixtureTeamSummary = {
  fixtureId: string;
  fixtureLabel: string;
  seasonId: string | null;
  opponent: string;
  matchesPlayed: number;
  teamResult: "win" | "loss" | "draw";
  matchWins: number;
  matchLosses: number;
  matchDraws: number;
  legsFor: number;
  legsAgainst: number;
  // team-wide aggregates for the West Green players; the opponents' visits are on each leg
  threeDartAvg: number | null;
  firstNineAvg: number | null;
  checkoutHits: number;
  checkoutAttempts: number;
  checkoutPct: number | null;
  highFinish: number | null;
  bestLegDarts: number | null;
  busts: number;
  bands: LegSummary["bands"];
  /** The opposition's combined numbers for the night; null when none of their visits were recorded. */
  opposition: OpponentMatchStats | null;
  matches: TeamMatchSummary[];
};

/**
 * Team-wide summary for a fixture: rolls up every completed match (each a
 * group of legs played by one West Green player vs one opponent, mirroring the
 * fixture page's grouping) into one set of team aggregates plus a per-match
 * breakdown. Returns null until at least one match is complete.
 */
export async function getFixtureTeamSummary(fixtureId: string): Promise<FixtureTeamSummary | null> {
  const supabase = await supabaseServer();
  if (!supabase) return null;

  const [{ data: fixture }, { data: games, error }] = await Promise.all([
    supabase.from("fixtures").select("id, opponent, home, season_id").eq("id", fixtureId).single(),
    supabase
      .from("games")
      .select("id, match_id, opponent_player, west_green_player_id, status, created_at")
      .eq("fixture_id", fixtureId)
      .eq("deleted", false)
      .order("created_at", { ascending: true })
  ]);
  if (error || !games || !games.length) return null;

  // Group legs into matches by match_id, falling back to West Green player +
  // opponent name for legacy rows (mirrors fixture page).
  const groups = new Map<string, LegRow[]>();
  games.forEach((g: LegRow) => {
    const key =
      g.match_id ?? `${g.west_green_player_id || "none"}|${(g.opponent_player || "").trim().toLowerCase()}`;
    const list = groups.get(key) ?? [];
    list.push(g);
    groups.set(key, list);
  });

  // Build a full MatchSummary for each completed match (skip any still in progress).
  const summaries: MatchSummary[] = [];
  for (const list of groups.values()) {
    if (list.some((g) => g.status === "in_progress")) continue;
    const completed = list.find((g) => g.status === "completed");
    if (!completed) continue;
    const ms = await getMatchSummary(completed.id);
    if (ms) summaries.push(ms);
  }
  if (!summaries.length) return null;

  const matches: TeamMatchSummary[] = summaries.map((m) => ({
    westPlayerId: m.westPlayerId ?? null,
    westPlayerName: m.westPlayerName,
    opponentPlayer: m.opponentPlayer,
    result: m.result,
    westLegs: m.westLegs,
    oppLegs: m.oppLegs,
    threeDartAvg: m.threeDartAvg,
    firstNineAvg: m.firstNineAvg,
    checkoutHits: m.checkoutHits,
    checkoutAttempts: m.checkoutAttempts,
    checkoutPct: m.checkoutPct,
    highFinish: m.highFinish,
    bestLegDarts: m.bestLegDarts,
    busts: m.busts,
    bands: m.bands,
    legs: m.legs,
    opponent: m.opponent
  }));

  const matchWins = summaries.filter((m) => m.result === "win").length;
  const matchLosses = summaries.filter((m) => m.result === "loss").length;
  const matchDraws = summaries.filter((m) => m.result === "draw").length;
  const legsFor = summaries.reduce((s, m) => s + m.westLegs, 0);
  const legsAgainst = summaries.reduce((s, m) => s + m.oppLegs, 0);
  const teamResult: FixtureTeamSummary["teamResult"] =
    matchWins > matchLosses ? "win" : matchLosses > matchWins ? "loss" : "draw";

  const dartsTotal = summaries.reduce((s, m) => s + m.dartsTotal, 0);
  const pointsTotal = summaries.reduce((s, m) => s + m.pointsTotal, 0);
  const checkoutHits = summaries.reduce((s, m) => s + m.checkoutHits, 0);
  const checkoutAttempts = summaries.reduce((s, m) => s + m.checkoutAttempts, 0);
  const f9 = summaries.filter((m) => m.firstNineAvg !== null);
  const highFinish = summaries.reduce<number | null>((max, m) => {
    if (m.highFinish === null) return max;
    return max === null ? m.highFinish : Math.max(max, m.highFinish);
  }, null);
  const bestLegDarts = summaries.reduce<number | null>((min, m) => {
    if (m.bestLegDarts === null) return min;
    return min === null ? m.bestLegDarts : Math.min(min, m.bestLegDarts);
  }, null);
  const bands = summaries.reduce(
    (acc, m) => ({
      sixtyPlus: acc.sixtyPlus + m.bands.sixtyPlus,
      eightyPlus: acc.eightyPlus + m.bands.eightyPlus,
      hundredPlus: acc.hundredPlus + m.bands.hundredPlus,
      oneFortyPlus: acc.oneFortyPlus + m.bands.oneFortyPlus,
      oneEighty: acc.oneEighty + m.bands.oneEighty,
      twentySix: acc.twentySix + m.bands.twentySix
    }),
    { sixtyPlus: 0, eightyPlus: 0, hundredPlus: 0, oneFortyPlus: 0, oneEighty: 0, twentySix: 0 }
  );

  return {
    fixtureId,
    fixtureLabel: fixture ? `${fixture.home ? "Home vs" : "Away @"} ${fixture.opponent}` : "Fixture",
    seasonId: fixture?.season_id ?? null,
    opponent: fixture?.opponent ?? "Opponent",
    matchesPlayed: summaries.length,
    teamResult,
    matchWins,
    matchLosses,
    matchDraws,
    legsFor,
    legsAgainst,
    threeDartAvg: dartsTotal > 0 ? (pointsTotal / dartsTotal) * 3 : null,
    firstNineAvg: f9.length ? f9.reduce((s, m) => s + (m.firstNineAvg ?? 0), 0) / f9.length : null,
    checkoutHits,
    checkoutAttempts,
    checkoutPct: checkoutAttempts > 0 ? (checkoutHits / checkoutAttempts) * 100 : null,
    highFinish,
    bestLegDarts,
    busts: summaries.reduce((s, m) => s + m.busts, 0),
    bands,
    opposition: summariseOpponent(summaries.flatMap((m) => m.legs)),
    matches
  };
}
