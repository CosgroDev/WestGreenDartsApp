import { lockMessage, lockSecondsAfter, pinFailed, pinLockSeconds, pinSucceeded, resetPinLimiterForTests, type LimiterDb } from "@/lib/pinLimiter";

beforeEach(() => resetPinLimiterForTests());

describe("lockSecondsAfter", () => {
  it("allows four failures, then doubles from 30 seconds up to 15 minutes", () => {
    expect([1, 2, 3, 4].map(lockSecondsAfter)).toEqual([0, 0, 0, 0]);
    expect([5, 6, 7, 8].map(lockSecondsAfter)).toEqual([30, 60, 120, 240]);
    expect(lockSecondsAfter(10)).toBe(900);
    expect(lockSecondsAfter(500)).toBe(900);
  });
});

describe("fallback limiter (limiter functions unavailable)", () => {
  const broken: LimiterDb = { rpc: async () => ({ data: null, error: { message: "function not found" } }) };

  it("locks a client out after five failures and releases when the lock expires", async () => {
    const t = 1_000_000;
    for (let i = 0; i < 4; i++) expect(await pinFailed(broken, "a", t)).toBe(0);
    expect(await pinLockSeconds(broken, "a", t)).toBe(0);
    expect(await pinFailed(broken, "a", t)).toBe(30);
    expect(await pinLockSeconds(broken, "a", t + 1000)).toBe(29);
    expect(await pinLockSeconds(broken, "a", t + 30_000)).toBe(0);
    expect(await pinFailed(broken, "a", t + 30_000)).toBe(60);
  });

  it("keeps clients independent and clears on success", async () => {
    for (let i = 0; i < 5; i++) await pinFailed(null, "a", 0);
    expect(await pinLockSeconds(null, "b", 0)).toBe(0);
    await pinSucceeded(null, "a");
    expect(await pinLockSeconds(null, "a", 0)).toBe(0);
    expect(await pinFailed(null, "a", 0)).toBe(0);
  });

  it("forgets failures after a quiet hour", async () => {
    for (let i = 0; i < 4; i++) await pinFailed(null, "a", 0);
    expect(await pinFailed(null, "a", 61 * 60 * 1000)).toBe(0);
  });

  it("survives a client that throws", async () => {
    const throwing: LimiterDb = { rpc: () => Promise.reject(new Error("network")) };
    expect(await pinLockSeconds(throwing, "a", 0)).toBe(0);
    expect(await pinFailed(throwing, "a", 0)).toBe(0);
  });
});

describe("database limiter", () => {
  it("uses the database's answer and passes the client key", async () => {
    const calls: [string, unknown][] = [];
    const db: LimiterDb = { rpc: async (fn, args) => { calls.push([fn, args.p_client]); return { data: fn === "wgd_pin_locked" ? 42 : 120, error: null }; } };
    expect(await pinLockSeconds(db, "k")).toBe(42);
    expect(await pinFailed(db, "k")).toBe(120);
    await pinSucceeded(db, "k");
    expect(calls).toEqual([["wgd_pin_locked", "k"], ["wgd_pin_failed", "k"], ["wgd_pin_succeeded", "k"]]);
  });
});

describe("lockMessage", () => {
  it("speaks in seconds, then minutes", () => {
    expect(lockMessage(30)).toBe("Too many attempts. Try again in 30 seconds.");
    expect(lockMessage(60)).toBe("Too many attempts. Try again in 1 minute.");
    expect(lockMessage(900)).toBe("Too many attempts. Try again in 15 minutes.");
  });
});
