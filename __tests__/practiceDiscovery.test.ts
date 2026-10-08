import { getSavedPractice } from "@/data/practiceHistory";
import { supabaseServer } from "@/lib/supabaseServer";

jest.mock("@/lib/supabaseServer", () => ({ supabaseServer: jest.fn() }));

// Simulate a Data API with a small page cap, which allRows must follow.
function database(tables: Record<string, any[]>, failingTable?: string) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let limit: number | undefined;
      const orders: { column: string; ascending: boolean }[] = [];
      const result = () => {
        const sorted = [...rows].sort((a, b) => {
          for (const { column, ascending } of orders) {
            if (a[column] !== b[column]) return (a[column] > b[column] ? 1 : -1) * (ascending ? 1 : -1);
          }
          return 0;
        });
        return { data: limit === undefined ? sorted : sorted.slice(0, limit), error: table === failingTable ? { message: "Offline" } : null };
      };
      const query = {
        select: () => query,
        eq(column: string, value: unknown) { rows = rows.filter(r => r[column] === value); return query; },
        neq(column: string, value: unknown) { rows = rows.filter(r => r[column] !== value); return query; },
        in(column: string, values: unknown[]) { rows = rows.filter(r => values.includes(r[column])); return query; },
        order(column: string, options: { ascending: boolean }) { orders.push({ column, ascending: options.ascending }); return query; },
        limit(value: number) { limit = value; return query; },
        range(start: number, end: number) { const value = result(); return Promise.resolve({ ...value, data: value.data.slice(start, Math.min(end + 1, start + 7)) }); },
        then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
  };
}

beforeEach(() => { process.env.TEAM_ID = "club"; jest.clearAllMocks(); });
const session = (id: string, status = "in_progress", extra = {}) => ({
  id, team_id: "club", status, created_at: "2026-01-01T18:00:00Z", completed_at: null,
  start_score: 501, legs_to_play: 3, player_a_id: "alice", player_b_id: "bob", player_a: { name: "Alice" }, player_b: { name: "Bob" }, ...extra,
});

test("every active game remains discoverable even when newer results exceed the history limit", async () => {
  const active = Array.from({ length: 24 }, (_, i) => session(`active-${i}`));
  const completed = Array.from({ length: 30 }, (_, i) => session(`result-${i}`, "completed", { completed_at: `2026-10-${String(i + 1).padStart(2, "0")}T20:00:00Z` }));
  jest.mocked(supabaseServer).mockResolvedValue(database({ practice_sessions: [...active, ...completed] }) as any);
  const saved = await getSavedPractice("x01");
  expect(saved.filter(s => s.status === "in_progress")).toHaveLength(24);
  expect(saved.filter(s => s.status === "completed")).toHaveLength(20);
  expect(saved.some(s => s.id === "active-0" && s.href.includes("session=active-0"))).toBe(true);
});

test("a resumed older solo game sorts by its saved visit and retains its player filter", async () => {
  jest.mocked(supabaseServer).mockResolvedValue(database({
    practice_sessions: [session("old", "in_progress", { solo_mode: true, player_b_id: null }), session("new", "in_progress", { created_at: "2026-10-01T18:00:00Z" })],
    practice_events: [{ id: 1, session_id: "old", created_at: "2026-10-08T20:00:00Z" }],
  }) as any);
  const saved = await getSavedPractice("x01");
  expect(saved[0]).toMatchObject({ id: "old", players: "Alice · Solo", playerIds: ["alice"], updatedAt: "2026-10-08T20:00:00Z" });
});

test("failed saved-game reads remain distinguishable from a genuine empty history", async () => {
  jest.mocked(supabaseServer).mockResolvedValue(database({}, "practice_sessions") as any);
  await expect(getSavedPractice("x01")).rejects.toThrow();
  jest.mocked(supabaseServer).mockResolvedValue(database({}) as any);
  await expect(getSavedPractice("x01")).resolves.toEqual([]);
});

test("another team's games cannot appear in the shared device's practice list", async () => {
  jest.mocked(supabaseServer).mockResolvedValue(database({ practice_sessions: [session("ours"), session("theirs", "in_progress", { team_id: "other" })] }) as any);
  expect((await getSavedPractice("x01")).map(s => s.id)).toEqual(["ours"]);
});
