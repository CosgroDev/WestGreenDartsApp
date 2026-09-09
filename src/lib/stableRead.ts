import { supabaseServer } from "./supabaseServer";

// A REST page consists of several queries. Do not attach a newer revision to
// an older score: retry if a command committed while the page was being read.
export async function stableRead<T>(table: string, id: string, read: () => Promise<T>): Promise<T> {
  const db = await supabaseServer();
  if (!db) throw new Error("Database not configured");
  const revision = async () => {
    const { data, error } = await db.from(table).select("revision").eq("id", id).single();
    if (error || !data) throw new Error(error?.message ?? "Game not found");
    return data.revision;
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = await revision();
    const result = await read();
    if (before === await revision()) return result;
  }
  throw new Error("The score is changing on another device. Reload before scoring.");
}
