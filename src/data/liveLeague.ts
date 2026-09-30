import { unstable_cache, revalidateTag } from "next/cache";
import { getLiveLeagueData } from "@/lib/liveLeague";
import { shouldRefreshLeague } from "@/lib/leagueRefresh";

const TAG = "live-league-source-v4";
type Data = Awaited<ReturnType<typeof getLiveLeagueData>>;
type State = { data?: Data; pending?: Promise<Data>; forced?: boolean };
const shared = globalThis as typeof globalThis & { __westGreenLeagueSource?: State };
const state = () => shared.__westGreenLeagueSource ??= {};

// Next invalidates tags at request completion. Keep the freshly fetched value
// shared across route bundles while the persistent cache is being repopulated.
async function loadSource() {
  const current = state();
  if (current.data) return current.data;
  return getLiveLeagueData();
}
// Bound callbacks retain a stable identity across compiled route bundles.
// The explicit versioned key identifies the source schema.
const read = unstable_cache(loadSource.bind(null), [TAG], { revalidate: false, tags: [TAG] });

export async function getCachedLiveLeagueData(force = false): Promise<Data> {
  const current = state();
  while (current.pending) {
    if (!force || current.forced) return current.pending;
    await current.pending;
  }
  current.forced = force;
  const load = async () => {
    const data = force ? undefined : current.data ?? await read();
    if (data && !shouldRefreshLeague(data.checkedAt)) {
      current.data = data;
      return data;
    }
    // Manual and scheduled refresh await a genuine no-store source request.
    // Invalidate only after success, preserving the old cache on source failure.
    const fresh = await getLiveLeagueData();
    current.data = fresh;
    revalidateTag(TAG);
    return fresh;
  };
  current.pending = load();
  try { return await current.pending; } finally { current.pending = undefined; }
}
