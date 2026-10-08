import { supabaseServer } from "./supabaseServer";
/** Validate roster selections against the configured team before creating a session. */
export async function validatePracticePlayers(ids: string[]) {
  const db = await supabaseServer();
  if (!db || !process.env.TEAM_ID)
    return {
      ok: false as const,
      message: "Database or team is not configured.",
    };
  if (ids.some((id) => !/^[0-9a-f-]{36}$/i.test(id)))
    return {
      ok: false as const,
      message: "Choose players from the team roster.",
    };
  if (ids.length) {
    const { data, error } = await db
      .from("players")
      .select("id")
      .eq("team_id", process.env.TEAM_ID)
      .eq("active", true)
      .in("id", ids);
    if (error) return { ok: false as const, message: error.message };
    if (data?.length !== new Set(ids).size)
      return {
        ok: false as const,
        message:
          "A selected player is no longer available. Refresh the roster.",
      };
  }
  return { ok: true as const, db };
}
