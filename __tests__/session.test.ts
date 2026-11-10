import { issueSession, SESSION_SECONDS, verifySession } from "@/lib/session";

const env = { ...process.env };
beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret";
  process.env.TEAM_ID = "team-1";
  process.env.PIN_HASH = "a".repeat(64);
});
afterAll(() => { process.env = env; });

describe("session tokens", () => {
  it("verifies a freshly issued token", async () => {
    expect(await verifySession(await issueSession())).toBe(true);
  });

  it("rejects missing, malformed and unsigned tokens", async () => {
    expect(await verifySession(undefined)).toBe(false);
    expect(await verifySession("")).toBe(false);
    expect(await verifySession("1")).toBe(false);
    expect(await verifySession("v1.9999999999.not-a-uuid.abc")).toBe(false);
  });

  it("rejects a tampered expiry or signature", async () => {
    const token = await issueSession();
    const [v, exp, id, sig] = token.split(".");
    expect(await verifySession([v, String(Number(exp) - 1), id, sig].join("."))).toBe(false);
    const flipped = (sig[0] === "0" ? "1" : "0") + sig.slice(1);
    expect(await verifySession([v, exp, id, flipped].join("."))).toBe(false);
  });

  it("expires after thirty days", async () => {
    const now = Date.now();
    const token = await issueSession(now);
    expect(await verifySession(token, now + (SESSION_SECONDS - 1) * 1000)).toBe(true);
    expect(await verifySession(token, now + SESSION_SECONDS * 1000)).toBe(false);
  });

  it("rejects an expiry further out than a session can last", async () => {
    const now = Date.now();
    const token = await issueSession(now + 24 * 60 * 60 * 1000);
    expect(await verifySession(token, now)).toBe(false);
  });

  it("is invalidated by a new secret, a new PIN or a different team", async () => {
    const token = await issueSession();
    process.env.SESSION_SECRET = "rotated";
    expect(await verifySession(token)).toBe(false);
    process.env.SESSION_SECRET = "test-secret";
    process.env.PIN_HASH = "b".repeat(64);
    expect(await verifySession(token)).toBe(false);
    process.env.PIN_HASH = "a".repeat(64);
    process.env.TEAM_ID = "team-2";
    expect(await verifySession(token)).toBe(false);
    process.env.TEAM_ID = "team-1";
    expect(await verifySession(token)).toBe(true);
  });

  it("refuses everything when no signing secret is configured", async () => {
    const token = await issueSession();
    delete process.env.SESSION_SECRET;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await verifySession(token)).toBe(false);
  });
});
