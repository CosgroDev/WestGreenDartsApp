import { isLeagueRefreshWindow, shouldRefreshLeague } from "../src/lib/leagueRefresh";
test.each([
  ["2026-09-28T18:59:59Z", false], // Monday 19:59 BST
  ["2026-09-28T19:00:00Z", true],
  ["2026-09-29T22:59:59Z", true], // Tuesday 23:59 BST
  ["2026-09-29T23:00:00Z", false],
  ["2026-01-05T19:59:59Z", false], // winter GMT
  ["2026-01-05T20:00:00Z", true],
  ["2026-01-06T23:59:59Z", true],
  ["2026-01-07T00:00:00Z", false],
  ["2026-10-04T20:00:00Z", false]
])("UK refresh window at %s is %s", (date, expected) => {
  expect(isLeagueRefreshWindow(new Date(date))).toBe(expected);
});
test("cache age only triggers a fetch within the match window", () => {
  expect(shouldRefreshLeague("2026-09-28T19:00:00Z", new Date("2026-09-28T19:04:59Z"))).toBe(false);
  expect(shouldRefreshLeague("2026-09-28T19:00:00Z", new Date("2026-09-28T19:05:00Z"))).toBe(true);
  expect(shouldRefreshLeague("2026-09-28T19:00:00Z", new Date("2026-09-30T12:00:00Z"))).toBe(false);
});
