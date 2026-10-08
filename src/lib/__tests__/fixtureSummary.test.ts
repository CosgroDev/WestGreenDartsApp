import { getFixtureTeamSummary, getMatchSummary } from "@/data/matchSummary";
import { supabaseServer } from "@/lib/supabaseServer";

jest.mock("@/lib/supabaseServer", () => ({ supabaseServer: jest.fn() }));
jest.mock("@/lib/database", () => ({ allRows: jest.fn(async () => ({ data: [], error: null })) }));

function useGames(games: { id: string; match_id: string; status: string; winner: string | null }[]) {
  const fixture = { id: "night", opponent: "Visitors", home: true };
  const rows = games.map(g => ({ ...g, fixture_id: "night", west_green_player_id: "player", opponent_player: "Visitor", players: { name: "Team player" } }));
  (supabaseServer as jest.Mock).mockResolvedValue({
    from: (table: string) => {
      let id = "";
      const query = {
        select: () => query,
        eq: (column: string, value: string) => { if (column === "id") id = value; return query; },
        order: () => query,
        single: async () => ({ data: table === "fixtures" ? fixture : rows.find(g => g.id === id), error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ data: rows, error: null })
      };
      return query;
    }
  });
}
const rows = (count: number, twoLegs: boolean) => Array.from({ length: count }, (_, i) => Array.from({ length: twoLegs ? 2 : 1 }, (_, leg) => ({ id: `${i}-${leg}`, match_id: `m-${i}`, status: "completed", winner: "west_green" }))).flat();

test("unfinished match summary gives leg statistics with no final match result", async () => {
  useGames(rows(1, false));
  expect(await getMatchSummary("0-0")).toMatchObject({ result: null, complete: false, westLegs: 1, oppLegs: 0 });
});

test("team review data stays unavailable until six complete matches exist", async () => {
  useGames(rows(6, false));
  expect(await getFixtureTeamSummary("night")).toBeNull();
  useGames(rows(5, true));
  expect(await getFixtureTeamSummary("night")).toBeNull();
  useGames(rows(6, true));
  expect(await getFixtureTeamSummary("night")).toMatchObject({ matchesPlayed: 6, teamResult: "win", matchWins: 6, legsFor: 12 });
});

test("a reopened final leg prevents a stored fixture review from being treated as current", async () => {
  const games = rows(6, true);
  games[11].status = "in_progress";
  useGames(games);
  expect(await getFixtureTeamSummary("night")).toBeNull();
});
