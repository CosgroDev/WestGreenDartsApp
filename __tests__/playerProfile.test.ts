import { supabaseServer } from "@/lib/supabaseServer";
import { getProfileMatches, getProfilePractice } from "@/data/playerProfile";
jest.mock("@/lib/supabaseServer", () => ({ supabaseServer: jest.fn() }));

// Simulate a capped PostgREST response, including hydrated many-to-one joins.
function database(tables: Record<string, any[]>) {
  (supabaseServer as jest.Mock).mockResolvedValue({ from: (table: string) => {
    let rows = [...(tables[table] ?? [])];
    const value = (row: any, key: string) => key.split(".").reduce((current, part) => current?.[part], row);
    const query: any = {
      select: () => query,
      eq: (key: string, expected: unknown) => { rows = rows.filter(row => value(row, key) === expected); return query; },
      or: (filter: string) => {
        const predicates = filter.split(",").map(clause => clause.split("."));
        rows = rows.filter(row => predicates.some(([key, operator, expected]) => operator === "eq" && value(row, key) === expected));
        return query;
      },
      order: () => query,
      range: async (start: number, end: number) => ({ data: rows.slice(start, Math.min(start + 7, end + 1)), error: null })
    };
    return query;
  } });
}

it("profiles retain separate repeated pairings, scope history to its player/season, and keep unfinished matches provisional", async () => {
  const leg = (id: string, match: string, winner: string | null, status = "completed", season = "current", player = "west") => ({
    id, match_id: match, fixture_id: "fixture", west_green_player_id: player, opponent_player: "Same opponent", status, winner,
    created_at: "2026-10-08T19:00:00Z", deleted: false, fixtures: { opponent: "Visitors", starts_at: "2026-10-08T19:00:00Z", season_id: season }
  });
  database({ games: [leg("one-a", "one", "west_green"), leg("one-b", "one", "opponent"), leg("two-a", "two", "west_green"), leg("two-b", "two", null, "in_progress"),
    leg("old", "old", null, "completed", "previous"), leg("other", "other", null, "completed", "current", "another-player"),
    { ...leg("deleted", "deleted", null), deleted: true }, leg("legacy", "legacy", null)] });
  const matches = await getProfileMatches("west", "current");
  expect(matches).toHaveLength(3);
  expect(matches.find(match => match.key === "one")).toMatchObject({ complete: true, result: "draw", westWins: 1, oppWins: 1 });
  expect(matches.find(match => match.key === "two")).toMatchObject({ complete: false, result: null });
  expect(matches.find(match => match.key === "legacy")).toMatchObject({ complete: true, result: "draw" });
});

it("player practice includes either X01 seat, old active games beyond twenty records, and all saved drill modes", async () => {
  const sessions = Array.from({ length: 25 }, (_, index) => ({ id: `x${index}`, created_at: `2026-09-${String(index + 1).padStart(2, "0")}T12:00:00Z`, status: index === 0 ? "in_progress" : "completed", player_a_id: index % 2 ? "west" : "guest", player_b_id: index % 2 ? null : "west", start_score: 501, legs_to_play: 3 }));
  database({ practice_sessions: [...sessions, { ...sessions[0], id: "someone-else", player_a_id: "other", player_b_id: null }],
    game_121_sessions: [{ id: "challenge", player_id: "west", created_at: "2026-10-01T12:00:00Z", status: "won", current_checkout: 170 }],
    checkout_practice_sessions: [{ id: "checkout", player_id: "west", created_at: "2026-10-02T12:00:00Z", status: "completed", attempt_index: 12 }],
    doubles_practice_players: [{ id: "participant", session_id: "doubles", player_id: "west", score: 25, doubles_practice_sessions: { created_at: "2026-10-03T12:00:00Z", status: "in_progress" } }] });
  const history = await getProfilePractice("west");
  expect(history).toHaveLength(28);
  expect(history[0]).toMatchObject({ mode: "Doubles Switch", href: "/practice/doubles/scoring?session=doubles" });
  expect(history.find(session => session.id === "x0")).toMatchObject({ status: "in_progress", href: "/practice/scoring?session=x0" });
  expect(history.find(session => session.id === "challenge")?.href).toBe("/practice/121/scoring?session=challenge");
  expect(history.find(session => session.id === "checkout")?.href).toBe("/practice/checkout/scoring?session=checkout");
  expect(history.some(session => session.id === "someone-else")).toBe(false);
});
