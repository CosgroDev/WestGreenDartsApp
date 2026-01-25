"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabaseServer";
import { finishRoutes } from "@/lib/finishRoutes";

const TEAM_ID = process.env.TEAM_ID;
const revalidateAllDashboards = () => {
  revalidatePath("/dashboard");
  revalidatePath("/fixtures");
  revalidatePath("/players");
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
  const supabase = supabaseServer();
  if (!supabase) return [] as Visit[];

  const { data, error } = await supabase
    .from("scoring_events")
    .select("id, score, darts, remaining_after, is_bust, is_checkout")
    .eq("game_id", gameId)
    .eq("is_deleted", false)
    .order("throw_index", { ascending: true });

  if (error || !data) {
    console.warn("fetchVisits fallback", error?.message);
    return [];
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
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, summaries: [] as LegSummaryWire[] };

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id, fixture_id, west_green_player_id, opponent_player")
    .eq("id", gameId)
    .single();
  if (gameErr || !game) return { ok: false, summaries: [] as LegSummaryWire[] };

  const { data: legs, error: legsErr } = await supabase
    .from("games")
    .select("id, winner, status, completed_at")
    .eq("fixture_id", game.fixture_id)
    .eq("opponent_player", game.opponent_player)
    .eq("west_green_player_id", game.west_green_player_id)
    .eq("deleted", false)
    .eq("status", "completed")
    .order("completed_at", { ascending: true });

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

export async function loadGameStateAction(gameId: string) {
  const visits = await fetchVisits(gameId);
  const remaining = computeRemaining(visits);
  const finishHint = remaining >= 2 && remaining <= 170 ? finishRoutes[remaining] ?? null : null;
  const supabase = supabaseServer();
  let meta: any = null;
  if (supabase) {
    const { data: game } = await supabase
      .from("games")
      .select(
        "id, fixture_id, status, winner, darts_thrown, opponent_player, west_green_player_id, players:west_green_player_id(name)"
      )
      .eq("id", gameId)
      .single();
    if (game) {
      meta = game;
      // Count legs for this matchup within the fixture
      const matchQuery = supabase
        .from("games")
        .select("winner")
        .eq("fixture_id", game.fixture_id)
        .eq("opponent_player", game.opponent_player)
        .eq("deleted", false)
        .eq("status", "completed");
      const legsData =
        game.west_green_player_id === null
          ? await matchQuery.is("west_green_player_id", null)
          : await matchQuery.eq("west_green_player_id", game.west_green_player_id);

      if (!legsData.error && legsData.data) {
        const westLegs = legsData.data.filter((g: any) => g.winner === "west_green").length;
        const oppLegs = legsData.data.filter((g: any) => g.winner === "opponent").length;
        meta.legs = { west: westLegs, opp: oppLegs };
      }
    }
  }
  return { ok: true, visits, remaining, finishHint, meta };
}

export async function recordVisitAction(gameId: string, score: number, dartsOverride?: number) {
  if (!Number.isInteger(score) || score < 0 || score > 180) {
    return { ok: false, message: "Score must be 0-180" };
  }
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const existing = await fetchVisits(gameId);
  const remaining = computeRemaining(existing);
  const next = remaining - score;
  const isCheckout = next === 0;
  const isBust = !isCheckout && (next < 0 || next === 1);
  const remainingAfter = isBust ? remaining : next;
  const dartsUsed = isCheckout ? dartsOverride ?? 3 : 3;

  const { error } = await supabase.from("scoring_events").insert({
    team_id: TEAM_ID,
    game_id: gameId,
    throw_index: existing.length + 1,
    score,
    darts: dartsUsed,
    remaining_after: remainingAfter,
    is_bust: isBust,
    is_checkout: isCheckout
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  const visits = await fetchVisits(gameId);
  const newRemaining = computeRemaining(visits);
  const finishHint = newRemaining >= 2 && newRemaining <= 170 ? finishRoutes[newRemaining] ?? null : null;

  // Mark game complete if checked out
  let meta = null;
  if (isCheckout && newRemaining === 0) {
    const totalDarts = visits.reduce((sum, v) => sum + v.darts, 0);
    const finishScore = score;
    await supabase
      .from("games")
      .update({
        status: "completed",
        winner: "west_green",
        darts_thrown: totalDarts,
        high_finish: supabase.rpc ? undefined : undefined, // placeholder to avoid missing column if not present
        completed_at: new Date().toISOString()
      })
      .eq("id", gameId);
    // update high_finish if column exists
    // update high_finish only if column exists
    const { error: hfErr } = await supabase.from("games").update({ high_finish: finishScore }).eq("id", gameId);
    if (hfErr && hfErr.code !== "42703") {
      console.warn("high_finish update failed", hfErr.message);
    }
    meta = { status: "completed", winner: "west_green", darts_thrown: totalDarts };
    revalidateAllDashboards();
  }

  revalidatePath(`/scoring?game=${gameId}`);
  return { ok: true, visits, remaining: newRemaining, finishHint, meta };
}

export async function setOpponentWinAction(gameId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };
  const { error } = await supabase
    .from("games")
    .update({ status: "completed", winner: "opponent", completed_at: new Date().toISOString() })
    .eq("id", gameId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/scoring?game=${gameId}`);
  revalidateAllDashboards();
  return { ok: true, meta: { status: "completed", winner: "opponent" } };
}

export async function newLegAction(gameId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { data: game, error: fetchError } = await supabase
    .from("games")
    .select("fixture_id, west_green_player_id, opponent_player, west_green_starts")
    .eq("id", gameId)
    .single();
  if (fetchError || !game) return { ok: false, message: fetchError?.message || "Game not found" };

  const { data, error } = await supabase
    .from("games")
    .insert({
      team_id: TEAM_ID,
      fixture_id: game.fixture_id,
      west_green_player_id: game.west_green_player_id,
      opponent_player: game.opponent_player,
      west_green_starts: !game.west_green_starts // alternate starts
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: error?.message || "Could not start new leg" };

  revalidatePath(`/fixtures/${game.fixture_id}`);
  return { ok: true, gameId: data.id, fixtureId: game.fixture_id };
}

export async function undoLastVisitAction(gameId: string) {
  const supabase = supabaseServer();
  if (!supabase) return { ok: false, message: "Supabase not configured" };

  const { data: latest, error: findError } = await supabase
    .from("scoring_events")
    .select("id")
    .eq("game_id", gameId)
    .eq("is_deleted", false)
    .order("throw_index", { ascending: false })
    .limit(1)
    .single();

  if (findError) {
    return { ok: false, message: findError.message };
  }

  if (latest) {
    const { error } = await supabase.from("scoring_events").update({ is_deleted: true }).eq("id", latest.id);
    if (error) return { ok: false, message: error.message };
  }

  const visits = await fetchVisits(gameId);
  const remaining = computeRemaining(visits);
  const finishHint = remaining >= 2 && remaining <= 170 ? finishRoutes[remaining] ?? null : null;
  revalidatePath(`/scoring?game=${gameId}`);
  return { ok: true, visits, remaining, finishHint };
}
