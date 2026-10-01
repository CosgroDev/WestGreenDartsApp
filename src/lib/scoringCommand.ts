import { randomUUID } from "crypto";
import { missingSnapshotRPC } from "./scoreSnapshot";
import { supabaseServer } from "./supabaseServer";

export async function scoringCommand(gameId: string, practice: boolean, command: string, options: {
  side?: string; score?: number; darts?: number; revision?: number; requestId?: string; returnState?: boolean;
} = {}): Promise<any> {
  const db = await supabaseServer();
  if (!db || !process.env.TEAM_ID) return { ok: false, message: "Database or team is not configured" };
  let revision = options.revision;
  if (revision === undefined) {
    const { data, error } = await db.from(practice ? "practice_games" : "games").select("revision").eq("id", gameId).single();
    if (error || !data) return { ok: false, message: "Could not load the game. Check the database migration." };
    revision = data.revision;
  }
  const args = {
    p_game: gameId, p_team: process.env.TEAM_ID, p_revision: revision,
    p_request: options.requestId || randomUUID(), p_practice: practice, p_command: command,
    p_side: options.side || (practice ? "player_a" : "west_green"),
    p_score: options.score ?? 0, p_darts: options.darts ?? 3
  };
  let { data, error } = await db.rpc(options.returnState ? "wgd_score_command_state" : "wgd_score_command", args);
  if (options.returnState && missingSnapshotRPC(error, "wgd_score_command_state")) {
    ({ data, error } = await db.rpc("wgd_score_command", args));
  }
  if (error) return { ok: false, message: error.message };
  return data;
}
