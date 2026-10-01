import { finishRoutes } from "./finishRoutes";
import { buildLegStats } from "./scoringUtils";
export function leagueScoreSnapshot(raw: any) {
  const events = raw.events ?? [];
  const visits = events.filter((e: any) => e.thrower === "west_green");
  const opponent = events.filter((e: any) => e.thrower === "opponent");
  const remaining = visits.at(-1)?.remaining_after ?? 501;
  const meta = { ...raw.meta,
    opponentRemaining: opponent.at(-1)?.remaining_after ?? 501,
    activeSide: events.length ? (events.at(-1).thrower === "opponent" ? "west" : "opponent") : (raw.meta.west_green_starts ? "west" : "opponent"),
    throwLog: events.map((e: any) => e.thrower === "opponent" ? "opponent" : "west")
  };
  return { ok: true, visits, remaining, finishHint: finishRoutes[remaining] ?? null, meta,
    completedLegs: raw.completedLegs ?? [] };
}
export function practiceScoreSnapshot(raw: any) {
  const visits = raw.events ?? [];
  const start = raw.meta.practice_sessions?.start_score ?? 501;
  const a = visits.filter((v: any) => v.thrower === "player_a");
  const b = visits.filter((v: any) => v.thrower === "player_b");
  const remainingA = a.at(-1)?.remaining_after ?? start, remainingB = b.at(-1)?.remaining_after ?? start;
  return { ok: true, visits, meta: raw.meta, remainingA, remainingB,
    finishHintA: finishRoutes[remainingA] ?? null, finishHintB: finishRoutes[remainingB] ?? null,
    statsA: buildLegStats(a), statsB: buildLegStats(b) };
}
export function missingSnapshotRPC(error: { code?: string; message?: string } | null, name: string) {
  return error?.code === "PGRST202" && error.message?.includes(name);
}
