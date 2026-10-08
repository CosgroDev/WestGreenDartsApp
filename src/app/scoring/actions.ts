"use server";
import { leagueScoreSnapshot, missingSnapshotRPC } from "@/lib/scoreSnapshot";
import { stableRead } from "@/lib/stableRead";

import { revalidatePath } from "next/cache";
import { scoringCommand } from "@/lib/scoringCommand";
import { supabaseServer } from "@/lib/supabaseServer";
import { finishRoutes } from "@/lib/finishRoutes";
import { canFinishFrom } from "@/lib/scoringUtils";

const TEAM_ID = process.env.TEAM_ID;
const revalidateAllDashboards = () => {
  revalidatePath("/dashboard");
  revalidatePath("/fixtures");
  revalidatePath("/players");
  revalidatePath("/stats");
  revalidatePath("/matches", "layout");
};

type Visit = {
  id: number;
  score: number;
  darts: number;
  remaining_after: number;
  is_bust: boolean;
  is_checkout: boolean;
};

export type LegSummaryWire = {
  winner: "west" | "opponent";
  dartsTotal: number;
  pointsTotal: number;
  firstNine: number | null;
  firstNinePoints: number | null;
  firstNineDarts: number | null;
  buckets: Record<string, number>;
  gameId: string;
};

async function fetchVisits(gameId: string) {
  const supabase = await supabaseServer();
  if (!supabase) return [] as Visit[];

  const { data, error } = await supabase
    .from("scoring_events")
    .select("id, score, darts, remaining_after, is_bust, is_checkout")
    .eq("game_id", gameId)
    .eq("thrower", "west_green")
    .eq("is_deleted", false)
    .order("throw_index", { ascending: true });

  if (error || !data) {
    throw new Error(error?.message || "Could not load visits");
  }
  return data as Visit[];
}

function computeRemaining(visits: Visit[]) {
  return visits.length ? visits[visits.length - 1].remaining_after : 501;
}

function buildLegSummary(winner: "west" | "opponent", visits: Visit[]): LegSummaryWire {
  const dartsTotal = visits.reduce((s, v) => s + v.darts, 0);
  const pointsTotal = visits.reduce((s, v) => s + (v.is_bust ? 0 : v.score), 0);
  const firstThree = visits.slice(0, 3);
  const dartsFirst9 = firstThree.reduce((s, v) => s + v.darts, 0);
  const pointsFirst9 = firstThree.reduce((s, v) => s + (v.is_bust ? 0 : v.score), 0);
  const firstNine = dartsFirst9 === 9 ? (pointsFirst9 / dartsFirst9) * 3 : null;
  const buckets = { "26": 0, "60+": 0, "80+": 0, "100+": 0, "120+": 0, "140+": 0, "170+": 0, "180": 0 };
  visits.forEach((v) => {
    if (v.is_bust) return;
    const s = v.score;
    if (s === 26) buckets["26"]++;
    if (s >= 60 && s < 80) buckets["60+"]++;
    if (s >= 80 && s < 100) buckets["80+"]++;
    if (s >= 100 && s < 120) buckets["100+"]++;
    if (s >= 120 && s < 140) buckets["120+"]++;
    if (s >= 140 && s < 170) buckets["140+"]++;
    if (s >= 170 && s < 180) buckets["170+"]++;
    if (s === 180) buckets["180"]++;
  });
  return {
    winner,
    dartsTotal,
    pointsTotal,
    firstNine,
    firstNinePoints: dartsFirst9 === 9 ? pointsFirst9 : null,
    firstNineDarts: dartsFirst9 === 9 ? dartsFirst9 : null,
    buckets,
    gameId: ""
  };
}

export async function getLegSummariesAction(gameId: string) {
  const supabase = await supabaseServer();
  if (!supabase) return { ok: false, summaries: [] as LegSummaryWire[] };

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, fixture_id, west_green_player_id, opponent_player, match_id")
    .eq("id", gameId)
    .single();
  if (gameErr || !game) return { ok: false, summaries: [] as LegSummaryWire[] };

  const legsQuery = supabase
    .from("games")
    .select("id, winner, status, completed_at")
    .eq("deleted", false)
    .eq("status", "completed")
    .order("completed_at", { ascending: true });
  const { data: legs, error: legsErr } = game.match_id
    ? await legsQuery.eq("match_id", game.match_id)
    : game.west_green_player_id === null
    ? await legsQuery
        .eq("fixture_id", game.fixture_id)
        .eq("opponent_player", game.opponent_player)
        .is("west_green_player_id", null)
    : await legsQuery
        .eq("fixture_id", game.fixture_id)
        .eq("opponent_player", game.opponent_player)
        .eq("west_green_player_id", game.west_green_player_id);

  if (legsErr || !legs) return { ok: false, summaries: [] as LegSummaryWire[] };

  const summaries: LegSummaryWire[] = [];
  for (const leg of legs) {
    const visits = await fetchVisits(leg.id);
    const summary = buildLegSummary(leg.winner === "west_green" ? "west" : "opponent", visits);
    summary.gameId = leg.id;
    summaries.push(summary);
  }
  return { ok: true, summaries };
}

export async function loadGameStateAction(gameId: string): Promise<any> {
  const db = await supabaseServer();
  if (!db) return { ok: false, message: "Database not configured" };
  const { data, error } = await db.rpc("wgd_score_snapshot", { p_game: gameId, p_team: process.env.TEAM_ID, p_practice: false });
  if (!error) return withSummaries(leagueScoreSnapshot(data));
  if (!missingSnapshotRPC(error, "wgd_score_snapshot")) return { ok: false, message: error.message };
  return stableRead("games", gameId, () => readState(gameId));
}

async function readState(gameId: string) {
  const visits = await fetchVisits(gameId);
  const remaining = computeRemaining(visits);
  const finishHint = remaining >= 2 && remaining <= 170 ? finishRoutes[remaining] ?? null : null;
  const supabase = await supabaseServer();
  let meta: any = null;
  if (supabase) {
    const { data: game } = await supabase
      .from("games")
      .select(
        "id, fixture_id, status, winner, darts_thrown, opponent_player, west_green_player_id, match_id, revision, west_green_starts, players:west_green_player_id(name)"
      )
      .eq("id", gameId)
      .single();
    if (game) {
      meta = game;
      const { data: events, error: eventsError } = await supabase.from("scoring_events")
        .select("id, thrower, remaining_after").eq("game_id", gameId).eq("is_deleted", false).order("throw_index");
      if (eventsError) throw new Error(eventsError.message);
      meta.throwLog = (events || []).map(e => e.thrower === "opponent" ? "opponent" : "west");
      const opponentEvents = (events || []).filter(e => e.thrower === "opponent");
      meta.opponentRemaining = opponentEvents.length ? opponentEvents[opponentEvents.length - 1].remaining_after : 501;
      meta.activeSide = events?.length ? (events[events.length - 1].thrower === "opponent" ? "west" : "opponent") : (game.west_green_starts ? "west" : "opponent");
      if (game.status === "completed") {
        const { data: next } = await supabase.from("games").select("id").eq("match_id", game.match_id).eq("deleted", false).eq("status", "in_progress").limit(1).maybeSingle();
        meta.nextGameId = next?.id;
      }
      // Count legs for this match within the fixture
      const matchQuery = supabase
        .from("games")
        .select("winner")
        .eq("deleted", false)
        .eq("status", "completed");
      const legsData = game.match_id
        ? await matchQuery.eq("match_id", game.match_id)
        : game.west_green_player_id === null
        ? await matchQuery
            .eq("fixture_id", game.fixture_id)
            .eq("opponent_player", game.opponent_player)
            .is("west_green_player_id", null)
        : await matchQuery
            .eq("fixture_id", game.fixture_id)
            .eq("opponent_player", game.opponent_player)
            .eq("west_green_player_id", game.west_green_player_id);

      if (!legsData.error && legsData.data) {
        const westLegs = legsData.data.filter((g: any) => g.winner === "west_green").length;
        const oppLegs = legsData.data.filter((g: any) => g.winner === "opponent").length;
        meta.legs = { west: westLegs, opp: oppLegs };
      }
    }
  }
  return { ok: true, visits, remaining, finishHint, meta };
}

function withSummaries(state: any) {
  const summaries = (state.completedLegs ?? []).map((leg: any) => ({
    ...buildLegSummary(leg.winner === "west_green" ? "west" : "opponent", leg.events), gameId: leg.id
  }));
  return { ...state, summaries };
}

export async function recordVisitAction(gameId: string, score: number, dartsOverride = 3, side: "west_green" | "opponent" = "west_green", revision?: number, requestId?: string): Promise<any> {
  if (!Number.isInteger(score) || score < 0 || score > 180 || !Number.isInteger(dartsOverride) || dartsOverride < 1 || dartsOverride > 3) return { ok: false, message: "Invalid score or dart count" };
  const result = await scoringCommand(gameId, false, "record", { side, score, darts: dartsOverride, revision, requestId, returnState: true });
  if (!result.ok) return result;
  revalidateAllDashboards();
  const state = result.state ? withSummaries(leagueScoreSnapshot(result.state)) : await loadGameStateAction(gameId);
  if (state.meta?.fixture_id) revalidatePath(`/fixtures/${state.meta.fixture_id}`);
  return state;
}

export async function newLegAction(gameId: string): Promise<any> {
  const result = await scoringCommand(gameId, false, "new_leg");
  if (!result.ok) return result;
  revalidateAllDashboards();
  return { ok: true, gameId: result.next_game_id };
}

export async function undoLastVisitAction(gameId: string, revision?: number, requestId?: string): Promise<any> {
  const result = await scoringCommand(gameId, false, "undo", { revision, requestId, returnState: true });
  if (!result.ok) return result;
  revalidateAllDashboards();
  const state = result.state ? withSummaries(leagueScoreSnapshot(result.state, result.undidThrower)) : await loadGameStateAction(result.reopened_game_id || gameId);
  if (state.meta && result.undidThrower === "west_green") state.meta.activeSide = "west";
  else if (state.meta && result.undidThrower === "opponent") state.meta.activeSide = "opponent";
  if (state.meta?.fixture_id) revalidatePath(`/fixtures/${state.meta.fixture_id}`);
  return { ...state, undidThrower: result.undidThrower };
}
