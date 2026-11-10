import { scoringCommand } from "@/lib/scoringCommand";
import { stableRead } from "@/lib/stableRead";
import { drillCommand, endDrill } from "@/lib/drillCommand";
import { supabaseServer } from "@/lib/supabaseServer";

jest.mock("@/lib/supabaseServer", () => ({ supabaseServer: jest.fn() }));
const server = jest.mocked(supabaseServer);

type Rpc = { data: unknown; error: { code?: string; message: string } | null };
/** A stand-in client: scripted RPC answers and a scripted sequence of revisions. */
function client({ rpc = [] as Rpc[], revisions = [] as (number | null)[] } = {}) {
  const rpcCalls: [string, Record<string, unknown>][] = [];
  const tables: string[] = [];
  const db = {
    rpc: jest.fn(async (fn: string, args: Record<string, unknown>) => { rpcCalls.push([fn, args]); return rpc.shift() ?? { data: { ok: true }, error: null }; }),
    from: jest.fn((table: string) => {
      tables.push(table);
      const chain = {
        select: () => chain, eq: () => chain,
        single: async () => {
          const revision = revisions.shift();
          return revision === null || revision === undefined
            ? { data: null, error: { message: "not found" } }
            : { data: { revision }, error: null };
        }
      };
      return chain;
    })
  };
  server.mockResolvedValue(db as never);
  return { db, rpcCalls, tables };
}

const env = { ...process.env };
beforeEach(() => { process.env.TEAM_ID = "team-1"; server.mockReset(); });
afterAll(() => { process.env = env; });

describe("scoringCommand", () => {
  it("refuses when the database or team is not configured", async () => {
    server.mockResolvedValue(null as never);
    expect(await scoringCommand("g", false, "record")).toEqual({ ok: false, message: "Database or team is not configured" });
    client();
    delete process.env.TEAM_ID;
    expect((await scoringCommand("g", false, "record")).ok).toBe(false);
  });

  it("sends the caller's revision and request ID unchanged, so a retry is the same command", async () => {
    const { rpcCalls, tables } = client();
    await scoringCommand("game-1", false, "record", { side: "opponent", score: 100, darts: 3, revision: 7, requestId: "req-1" });
    expect(tables).toEqual([]);
    expect(rpcCalls).toEqual([["wgd_score_command", {
      p_game: "game-1", p_team: "team-1", p_revision: 7, p_request: "req-1", p_practice: false,
      p_command: "record", p_side: "opponent", p_score: 100, p_darts: 3
    }]]);
  });

  it("looks the revision up when the caller has none, from the right table", async () => {
    const league = client({ revisions: [4] });
    await scoringCommand("g", false, "new_leg");
    expect(league.tables).toEqual(["games"]);
    expect(league.rpcCalls[0][1]).toMatchObject({ p_revision: 4, p_side: "west_green", p_score: 0, p_darts: 3 });

    const practice = client({ revisions: [2] });
    await scoringCommand("g", true, "undo");
    expect(practice.tables).toEqual(["practice_games"]);
    expect(practice.rpcCalls[0][1]).toMatchObject({ p_revision: 2, p_side: "player_a", p_practice: true });
  });

  it("reports a game it cannot find instead of sending a command", async () => {
    const { rpcCalls } = client({ revisions: [null] });
    expect((await scoringCommand("g", false, "record")).ok).toBe(false);
    expect(rpcCalls).toEqual([]);
  });

  it("falls back to the plain command when the state-returning RPC is not installed", async () => {
    const { rpcCalls } = client({ rpc: [
      { data: null, error: { code: "PGRST202", message: "Could not find the function public.wgd_score_command_state" } },
      { data: { ok: true }, error: null }
    ] });
    expect(await scoringCommand("g", false, "record", { revision: 1, requestId: "r", returnState: true })).toEqual({ ok: true });
    expect(rpcCalls.map(([fn]) => fn)).toEqual(["wgd_score_command_state", "wgd_score_command"]);
    expect(rpcCalls[0][1]).toEqual(rpcCalls[1][1]);
  });

  it("passes a stale-revision rejection back as a message, without retrying", async () => {
    const { rpcCalls } = client({ rpc: [{ data: null, error: { code: "P0001", message: "The score changed on another device" } }] });
    expect(await scoringCommand("g", false, "record", { revision: 1, returnState: true }))
      .toEqual({ ok: false, message: "The score changed on another device" });
    expect(rpcCalls).toHaveLength(1);
  });
});

describe("stableRead", () => {
  it("returns the read when the revision did not move", async () => {
    client({ revisions: [3, 3] });
    const read = jest.fn(async () => "state");
    expect(await stableRead("games", "g", read)).toBe("state");
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("reads again when a command landed mid-read", async () => {
    client({ revisions: [3, 4, 4, 4] });
    const read = jest.fn(async () => "state");
    expect(await stableRead("games", "g", read)).toBe("state");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("gives up after three unstable reads", async () => {
    client({ revisions: [1, 2, 2, 3, 3, 4] });
    await expect(stableRead("games", "g", async () => "state")).rejects.toThrow(/changing on another device/);
  });

  it("fails when the game does not exist or the database is missing", async () => {
    client({ revisions: [null] });
    await expect(stableRead("games", "g", async () => "state")).rejects.toThrow();
    server.mockResolvedValue(null as never);
    await expect(stableRead("games", "g", async () => "state")).rejects.toThrow("Database not configured");
  });
});

describe("drillCommand", () => {
  it("sends one transactional command with the team and request ID", async () => {
    const { rpcCalls } = client();
    expect(await drillCommand("121", "s", 2, { score: 60 }, { remaining: 61 }, null, null, "req")).toEqual({ ok: true });
    expect(rpcCalls).toEqual([["wgd_drill_command", {
      p_mode: "121", p_session: "s", p_team: "team-1", p_revision: 2, p_request: "req",
      p_event: { score: 60 }, p_patch: { remaining: 61 }, p_player: null, p_player_patch: null
    }]]);
  });

  it("returns the database's rejection as a message", async () => {
    client({ rpc: [{ data: null, error: { message: "stale" } }] });
    expect(await drillCommand("checkout", "s", 1, null, {})).toEqual({ ok: false, message: "stale" });
  });

  it("ends a drill at its current revision, in the right table", async () => {
    const drill = client({ revisions: [5] });
    await endDrill("doubles", "s", "abandoned");
    expect(drill.tables).toEqual(["doubles_practice_sessions"]);
    expect(drill.rpcCalls[0][1]).toMatchObject({ p_mode: "doubles", p_revision: 5, p_event: null, p_patch: { status: "abandoned" } });

    const game121 = client({ revisions: [1] });
    await endDrill("121", "s", "completed", 9);
    expect(game121.tables).toEqual(["game_121_sessions"]);
    expect(game121.rpcCalls[0][1]).toMatchObject({ p_revision: 9 });
  });

  it("reports a session it cannot find", async () => {
    client({ revisions: [null] });
    expect(await endDrill("121", "s", "completed")).toEqual({ ok: false, message: "Session not found" });
  });
});
