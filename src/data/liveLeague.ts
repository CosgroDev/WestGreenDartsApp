import { unstable_cache, revalidateTag } from "next/cache";
import { getLiveLeagueData } from "@/lib/liveLeague";
import { shouldRefreshLeague } from "@/lib/leagueRefresh";

const TAG = "live-league-source-v2";
// Both pages share a persistent source cache. No age-based expiration outside
// match nights: navigation alone must not cause repeated off-window source calls.
const read = unstable_cache(getLiveLeagueData, [TAG], { revalidate: false, tags: [TAG] });
let pending: ReturnType<typeof getLiveLeagueData> | null = null;
let pendingForce = false;

export async function getCachedLiveLeagueData(force = false) {
  while (pending) {
    if (!force || pendingForce) return pending;
    await pending;
  }
  pendingForce = force;
  const load = async () => {
    if (force) {
      revalidateTag(TAG);
      return read();
    }
    const data = await read();
    if (!shouldRefreshLeague(data.checkedAt)) return data;
    revalidateTag(TAG);
    return read();
  };
  pending = load();
  try { return await pending; } finally { pending = null; }
}
