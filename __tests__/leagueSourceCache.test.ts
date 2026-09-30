import { getCachedLiveLeagueData } from "../src/data/liveLeague";
import { getLiveLeagueData } from "@/lib/liveLeague";
import { revalidateTag } from "next/cache";
let mockValue: unknown = null;
jest.mock("next/cache", () => ({
  unstable_cache: (fn: () => Promise<unknown>) => async () => {
    if (!mockValue) mockValue = await fn();
    return mockValue;
  },
  revalidateTag: jest.fn(() => { mockValue = null; })
}));
jest.mock("@/lib/liveLeague", () => ({ getLiveLeagueData: jest.fn() }));
const fetchData = jest.mocked(getLiveLeagueData);
beforeEach(() => {
  jest.useFakeTimers();
  mockValue = null;
  jest.clearAllMocks();
});
afterEach(() => { jest.useRealTimers(); });
test("off-window navigation retains old data; manual refresh awaits new data shared by both pages", async () => {
  jest.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  const old = { checkedAt: "2026-09-29T22:00:00Z" } as Awaited<ReturnType<typeof getLiveLeagueData>>;
  const fresh = { checkedAt: "2026-09-30T12:00:00Z" } as typeof old;
  fetchData.mockResolvedValueOnce(old).mockResolvedValueOnce(fresh);
  expect(await getCachedLiveLeagueData()).toBe(old);
  expect(await getCachedLiveLeagueData()).toBe(old);
  expect(fetchData).toHaveBeenCalledTimes(1);
  expect(await getCachedLiveLeagueData(true)).toBe(fresh);
  expect(await getCachedLiveLeagueData()).toBe(fresh);
  expect(fetchData).toHaveBeenCalledTimes(2);
  expect(revalidateTag).toHaveBeenCalledTimes(1);
});
test("on-window expired data refreshes synchronously, but fresh data is reused", async () => {
  jest.setSystemTime(new Date("2026-09-28T19:10:00Z"));
  fetchData.mockResolvedValueOnce({ checkedAt: "2026-09-28T19:00:00Z" } as Awaited<ReturnType<typeof getLiveLeagueData>>)
    .mockResolvedValueOnce({ checkedAt: "2026-09-28T19:10:00Z" } as Awaited<ReturnType<typeof getLiveLeagueData>>);
  expect((await getCachedLiveLeagueData()).checkedAt).toBe("2026-09-28T19:10:00Z");
  await getCachedLiveLeagueData();
  expect(fetchData).toHaveBeenCalledTimes(2);
});
test("manual refresh waits for an ordinary in-flight read then forces a fresh fetch", async () => {
  jest.setSystemTime(new Date("2026-09-30T12:00:00Z"));
  const old = { checkedAt: "2026-09-29T22:00:00Z" } as Awaited<ReturnType<typeof getLiveLeagueData>>;
  const fresh = { checkedAt: "2026-09-30T12:00:00Z" } as typeof old;
  let release!: (value: typeof old) => void;
  fetchData.mockImplementationOnce(() => new Promise(resolve => { release = resolve; })).mockResolvedValueOnce(fresh);
  const normal = getCachedLiveLeagueData();
  const manual = getCachedLiveLeagueData(true);
  release(old);
  expect(await normal).toBe(old);
  expect(await manual).toBe(fresh);
});
