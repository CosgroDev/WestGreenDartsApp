import { redirect } from "next/navigation";
import { supabaseServer } from "./supabaseServer";

type DbResult<T> = { data: T; error: { message: string; code?: string } | null };

/** Unwrap a database result. A failure is thrown so it reaches the error boundary instead of vanishing. */
export function must<T>(result: DbResult<T>, what: string): T {
  if (result.error) throw new Error(`${what} failed: ${result.error.message}`);
  return result.data;
}

/** The authenticated database client and team, or a thrown configuration error. */
export async function teamDb() {
  const db = await supabaseServer();
  const teamId = process.env.TEAM_ID;
  if (!db || !teamId) throw new Error("Database or team is not configured");
  return { db, teamId };
}

/** Send the user back to a page with a message it can show. For expected, user-fixable problems. */
export function backWithError(path: string, code: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`);
}
