import { fixtureFocusLabel, groupFixtureMatches, londonDate, londonLocalToISO, selectFixtureFocus, summariseFixture, type FixtureLeg } from "../fixtureState";

function leg(match: number, index: number, status = "completed", winner: string | null = "west_green"): FixtureLeg {
  return { id: `${match}-${index}`, match_id: `match-${match}`, fixture_id: "night", west_green_player_id: `p-${match}`, opponent_player: `Opponent ${match}`, status, winner, created_at: `2026-10-08T${String(19 + match).padStart(2, "0")}:${index}0:00Z` };
}
const sixMatches = () => Array.from({ length: 6 }, (_, i) => [leg(i, 0), leg(i, 1)]).flat();

describe("fixture completion", () => {
  test("six completed first legs do not complete six matches", () => {
    expect(summariseFixture(Array.from({ length: 6 }, (_, i) => leg(i, 0)))).toMatchObject({ complete: false, status: "in_progress", completedMatches: 0, matchDraws: 0 });
  });
  test("six two-leg matches complete; deleted or reopened legs restore unfinished state", () => {
    const games = sixMatches();
    expect(summariseFixture(games)).toMatchObject({ complete: true, status: "win", completedMatches: 6, matchWins: 6 });
    games[11].deleted = true;
    expect(summariseFixture(games)).toMatchObject({ complete: false, completedMatches: 5 });
    games[11].deleted = false; games[11].status = "in_progress";
    expect(summariseFixture(games).complete).toBe(false);
  });
  test("historical one-row draws remain valid without treating unfinished ties as draws", () => {
    expect(summariseFixture(Array.from({ length: 6 }, (_, i) => leg(i, 0, "completed", null)))).toMatchObject({ complete: true, status: "draw", matchDraws: 6, legsFor: 6, legsAgainst: 6 });
    expect(groupFixtureMatches([leg(0, 0, "in_progress", null)])[0].result).toBeNull();
  });
  test("legacy name matching is null safe and case insensitive; slots are stable", () => {
    const games = [leg(0, 0), leg(0, 1)].map((g, i) => ({ ...g, match_id: null, west_green_player_id: null, opponent_player: i ? " visitor " : "VISITOR", match_position: 4 }));
    expect(groupFixtureMatches(games)).toHaveLength(1);
    expect(groupFixtureMatches(games)[0]).toMatchObject({ position: 4, complete: true });
  });
  test("more than six groups or malformed extra legs cannot produce a fixture result", () => {
    expect(summariseFixture([...sixMatches(), leg(6, 0), leg(6, 1)]).complete).toBe(false);
    expect(summariseFixture([...sixMatches(), leg(0, 2)]).complete).toBe(false);
  });
});

describe("UK match-night selection", () => {
  const fixture = (starts_at: string, games: FixtureLeg[] = []) => ({ starts_at, games });
  test("tonight stays visible before and after kickoff, with future fixture secondary", () => {
    const tonight = fixture("2026-10-08T19:00:00Z");
    const next = fixture("2026-10-15T19:00:00Z");
    for (const hour of [15, 21]) {
      const now = new Date(`2026-10-08T${hour}:00:00Z`);
      expect(selectFixtureFocus([next, tonight], now)).toMatchObject({ current: tonight, next });
      expect(fixtureFocusLabel(tonight, now)).toBe("Tonight’s game");
    }
  });
  test("UK midnight retains unfinished fixture; tonight takes priority over older night", () => {
    const older = fixture("2026-10-08T19:00:00Z");
    const tonight = fixture("2026-10-09T19:00:00Z");
    const now = new Date("2026-10-08T23:05:00Z");
    expect(londonDate(now)).toBe("2026-10-09");
    expect(selectFixtureFocus([older], now).current).toBe(older);
    expect(fixtureFocusLabel(older, now)).toBe("Current game · Unfinished");
    expect(selectFixtureFocus([older, tonight], now).current).toBe(tonight);
  });
  test("completed nights move on; undo makes the night eligible again", () => {
    const games = sixMatches(), tonight = fixture("2026-10-08T19:00:00Z", games);
    const next = fixture("2026-10-15T19:00:00Z");
    const now = new Date("2026-10-08T21:00:00Z");
    expect(selectFixtureFocus([tonight, next], now)).toMatchObject({ current: null, next });
    games[11].status = "in_progress";
    expect(selectFixtureFocus([tonight, next], now).current).toBe(tonight);
  });
  test("DST London day boundaries differ from UTC only in summer", () => {
    expect(londonDate("2026-03-29T23:15:00Z")).toBe("2026-03-30");
    expect(londonDate("2026-10-25T23:15:00Z")).toBe("2026-10-25");
  });
  test("UK wall times are persisted as UTC, rejecting impossible dates and DST gap", () => {
    expect(londonLocalToISO("2026-07-08T20:00")).toBe("2026-07-08T19:00:00.000Z");
    expect(londonLocalToISO("2026-12-08T20:00")).toBe("2026-12-08T20:00:00.000Z");
    expect(londonLocalToISO("2026-03-29T01:30")).toBeNull();
    expect(londonLocalToISO("2026-02-30T20:00")).toBeNull();
  });
});
