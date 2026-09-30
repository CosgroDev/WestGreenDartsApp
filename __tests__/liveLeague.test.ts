import { calculateLeagueStandings, getLeagueWindow, getWestGreenLeagueContext, BASE44_API, TARGET_LEAGUE } from "../src/lib/liveLeague";

const team = (id: string, extra = {}) => ({ id, name: id, league_id: "l", ...extra });
const fixture = (id: string, home: string, away: string, h: number | null, a: number | null, extra = {}) => ({
  id, league_id: "l", home_team_id: home, away_team_id: away, home_score: h, away_score: a, played: true, ...extra
});

it("uses legs won minus deductions and excludes unplayed and other-league fixtures", () => {
  const rows = calculateLeagueStandings("l", [team("A", { points_deduction: 4 }), team("B")], [
    fixture("f", "A", "B", 9, 3), fixture("ignored", "A", "B", 12, 0, { played: false }),
    fixture("other", "A", "B", 12, 0, { league_id: "elsewhere" })
  ]);
  expect(rows[0]).toMatchObject({ team: "A", points: 5, legsFor: 9, legsAgainst: 3, played: 1, deduction: 4 });
});
it("applies points, leg difference and legs-for tie breaks, retaining API order for exact ties", () => {
  const teams = [team("A", { points_deduction: 2 }), team("B"), team("C"), team("D")];
  const fixtures = [fixture("a", "A", "X", 7, 2), fixture("b", "B", "X", 5, 0), fixture("c", "C", "X", 5, 1), fixture("d", "D", "X", 5, 1)];
  expect(calculateLeagueStandings("l", teams, fixtures).map(r => r.team)).toEqual(["A", "B", "C", "D"]);
});
it("excludes the source's no-game placeholders and treats played null scores as zero", () => {
  const rows = calculateLeagueStandings("l", [team("A"), team("placeholder", { number: 14 }), team("No Game")], [fixture("f", "A", "X", null, null)]);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ played: 1, points: 0 });
});
it.each([1, 2, 5, 13, 14])("returns only existing neighbours around position %i", (position) => {
  const rows = calculateLeagueStandings("l", Array.from({ length: 14 }, (_, i) => team(i + 1 === position ? "West Green" : "T" + i)), []);
  const window = getLeagueWindow(rows);
  expect(window.map(r => r.position)).toEqual(Array.from(
    { length: Math.min(14, position + 3) - Math.max(1, position - 3) + 1 },
    (_, i) => Math.max(1, position - 3) + i
  ));
  expect(window.filter(r => r.target)).toHaveLength(1);
});
it("fails clearly when West Green is absent or ambiguous", () => {
  expect(() => getLeagueWindow([])).toThrow();
  expect(() => getLeagueWindow(calculateLeagueStandings("l", [team("a", { name: "West Green" }), team("b", { name: "WEST GREEN" })], []))).toThrow();
});

describe("live API reader", () => {
  const original = global.fetch;
  afterEach(() => { global.fetch = original; });
  it("discovers league/team IDs and requests the exact source fixture order and limit", async () => {
    global.fetch = jest.fn(async (url) => ({
      ok: true,
      json: async () => String(url).endsWith("/League")
        ? [{ id: "l", name: TARGET_LEAGUE.toUpperCase() }]
        : String(url).endsWith("/Team")
        ? [team("west", { name: "West Green" })]
        : [fixture("f", "west", "X", 8, 4)]
    } as Response));
    const result = await getWestGreenLeagueContext();
    expect(result).toMatchObject({ leagueId: "l", targetPosition: 1, targetPoints: 8 });
    expect(global.fetch).toHaveBeenCalledWith(BASE44_API + "Fixture?sort=-updated_date&limit=500", expect.objectContaining({ cache: "no-store" }));
  });
  it("rejects authentication errors and changed JSON shapes instead of producing fake standings", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 401 } as Response));
    await expect(getWestGreenLeagueContext()).rejects.toThrow("401");
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: [] }) } as Response));
    await expect(getWestGreenLeagueContext()).rejects.toThrow("Unexpected");
  });
});
