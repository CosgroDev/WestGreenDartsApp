import { randomUUID } from "crypto";
import { supabaseServer } from "./supabaseServer";

export async function drillCommand(mode: "121" | "checkout" | "doubles", sessionId: string, revision: number, event: object | null, patch: object, playerId: string | null = null, playerPatch: object | null = null, requestId = randomUUID()): Promise<{ ok: boolean; message?: string }> {
  const db = await supabaseServer();
  if (!db) return {ok: false, message: "Database not configured"};
  const {data, error} = await db.rpc("wgd_drill_command", {
    p_mode: mode, p_session: sessionId, p_team: process.env.TEAM_ID, p_revision: revision,
    p_request: requestId, p_event: event, p_patch: patch, p_player: playerId, p_player_patch: playerPatch
  });
  return error ? {ok: false, message: error.message} : data;
}

export async function endDrill(mode: "121" | "checkout" | "doubles", sessionId: string, status: "completed" | "abandoned", revision?: number) {
  const db = await supabaseServer();
  if (!db) return {ok: false, message: "Database not configured"};
  const table = mode === "121" ? "game_121_sessions" : `${mode}_practice_sessions`;
  const {data, error} = await db.from(table).select("revision").eq("id", sessionId).single();
  if (error || !data) return {ok: false, message: "Session not found"};
  return drillCommand(mode, sessionId, revision ?? data.revision, null, {status});
}
