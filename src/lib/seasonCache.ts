import { revalidateTag, unstable_cache } from "next/cache";

// Season statistics are rebuilt from every scoring event of the season, so the
// loaded rows are cached and dropped whenever a result changes.
const TAG = "season-stats";
// Backstop for changes made outside the app (for example in the SQL editor).
const MAX_AGE_SECONDS = 300;

/** Cache `read` under a per-season key. Outside a Next.js request (unit tests) it runs uncached. */
export async function cachedSeason<T>(seasonKey: string, read: () => Promise<T>): Promise<T> {
  let cached: () => Promise<T>;
  try {
    cached = unstable_cache(read, ["season-stats-v2", seasonKey], { tags: [TAG], revalidate: MAX_AGE_SECONDS });
  } catch {
    return read();
  }
  try {
    return await cached();
  } catch (error) {
    // Next throws an invariant when no incremental cache exists (tests, scripts).
    if (error instanceof Error && /incrementalCache|Invariant/i.test(error.message)) return read();
    throw error;
  }
}

/** Call after anything that changes completed legs, fixtures, players or seasons. */
export function invalidateSeasonStats() {
  try {
    revalidateTag(TAG);
  } catch {
    // No request scope (tests, scripts): nothing is cached, so nothing to drop.
  }
}
