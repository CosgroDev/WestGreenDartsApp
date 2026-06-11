import { supabaseServer } from "@/lib/supabaseServer";

export type Visit = {
  score: number;
  darts: number;
  remainingAfter: number;
  isBust: boolean;
  isCheckout: boolean;
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
};

export type MatchSummary = {
  fixtureId: string;
  fixtureLabel: string;
  westPlayerName: string;
  opponentPlayer: string;
  westLegs: number;
  oppLegs: number;
  result: "win" | "loss" | "draw";
  legs: LegSummary[];
  // match-level aggregates (West Green player only — opponent visits aren't tracked)
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
};

function summariseLeg(gameId: string, winner: LegSummary["winner"], visits: Visit[]): LegSummary {
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
    if (remainingBefore <= 170) {
      checkoutAttempts += 1;
      if (v.isCheckout) checkoutHits += 1;
    }
    if (v.isCheckout) highFinish = highFinish === null ? v.score : Math.max(highFinish, v.score);
    if (v.score === 26) bands.twentySix += 1;
    if (v.score >= 60) bands.sixtyPlus += 1;
    if (v.score >= 80) bands.eightyPlus += 1;
    if (v.score >= 100) bands.hundredPlus += 1;
    if (v.score >= 140) bands.oneFortyPlus += 1;
    if (v.score === 180) bands.oneEighty += 1;
  });
  return {
    gameId,
    winner,
    visits,
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

/**
 * Full summary for a completed match. `gameId` may be any leg of the match;
 * the match is the group of game (leg) records sharing fixture + player +
 * opponent, mirroring the fixture page's grouping.
 */
export async function getMatchSummary(gameId: string): Promise<MatchSummary | null> {
  const supabase = supabaseServer();
  if (!supabase) return null;

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, fixture_id, west_green_player_id, opponent_player, players(name)")
    .eq("id", gameId)
    .single();
  if (gameErr || !game) return null;

  const [{ data: fixture }, { data: siblings, error: sibErr }] = await Promise.all([
    supabase.from("fixtures").select("id, opponent, home").eq("id", game.fixture_id).single(),
    supabase
      .from("games")
      .select("id, opponent_player, west_green_player_id, winner, status, created_at")
      .eq("fixture_id", game.fixture_id)
      .eq("deleted", false)
      .order("created_at", { ascending: true })
  ]);
  if (sibErr || !siblings) return null;

  const oppKey = (game.opponent_player || "").trim().toLowerCase();
  const legsGames = siblings.filter(
    (g: any) =>
      g.west_green_player_id === game.west_green_player_id &&
      (g.opponent_player || "").trim().toLowerCase() === oppKey &&
      g.status === "completed"
  );
  if (!legsGames.length) return null;

  const { data: events } = await supabase
    .from("scoring_events")
    .select("game_id, score, darts, remaining_after, is_bust, is_checkout, throw_index")
    .in("game_id", legsGames.map((g: any) => g.id))
    .eq("is_deleted", false)
    .order("throw_index", { ascending: true });

  const eventsByGame = new Map<string, Visit[]>();
  (events || []).forEach((e: any) => {
    const list = eventsByGame.get(e.game_id) || [];
    list.push({
      score: typeof e.score === "number" ? e.score : 0,
      darts: typeof e.darts === "number" ? e.darts : 3,
      remainingAfter: typeof e.remaining_after === "number" ? e.remaining_after : 0,
      isBust: e.is_bust === true,
      isCheckout: e.is_checkout === true
    });
    eventsByGame.set(e.game_id, list);
  });

  const legs: LegSummary[] = legsGames.map((g: any) =>
    summariseLeg(
      g.id,
      g.winner === "west_green" ? "west" : g.winner === "opponent" ? "opponent" : "draw",
      eventsByGame.get(g.id) || []
    )
  );

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
    westPlayerName: (game as any).players?.name ?? "West Green",
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
    bands
  };
}
