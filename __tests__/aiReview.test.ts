import Anthropic from "@anthropic-ai/sdk";
import { generateOnce, requestReview } from "@/lib/aiReview";
import { REVIEW_FALLBACK_MODEL, REVIEW_MODEL } from "@/lib/aiCoaching";

const clientReturning = (response: unknown) => {
  const create = jest.fn(async (_body: any) => response);
  return { client: { beta: { messages: { create } } }, create };
};
const request = { system: "SYSTEM", payload: { a: 1 }, effort: "medium" as const, subject: "match" };

describe("requestReview", () => {
  it("sends the configured model, fallback and payload, and joins the text blocks", async () => {
    const { client, create } = clientReturning({
      stop_reason: "end_turn",
      content: [{ type: "thinking", thinking: "…" }, { type: "text", text: " Good " }, { type: "text", text: "night. " }]
    });
    expect(await requestReview(request, client)).toEqual({ ok: true, text: "Good night." });
    expect(create).toHaveBeenCalledTimes(1);
    const body = create.mock.calls[0][0];
    expect(body).toMatchObject({
      model: REVIEW_MODEL,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      fallbacks: [{ model: REVIEW_FALLBACK_MODEL }],
      system: "SYSTEM",
      messages: [{ role: "user", content: JSON.stringify({ a: 1 }) }]
    });
  });

  it("honours a custom token limit and effort", async () => {
    const { client, create } = clientReturning({ stop_reason: "end_turn", content: [{ type: "text", text: "x" }] });
    await requestReview({ ...request, effort: "high", maxTokens: 20000 }, client);
    expect(create.mock.calls[0][0]).toMatchObject({ max_tokens: 20000, output_config: { effort: "high" } });
  });

  it("reports a refusal, naming what was being reviewed", async () => {
    const { client } = clientReturning({ stop_reason: "refusal", content: [] });
    expect(await requestReview({ ...request, subject: "season" }, client)).toEqual({ ok: false, message: "The AI declined to review this season." });
  });

  it("reports an empty response", async () => {
    const { client } = clientReturning({ stop_reason: "end_turn", content: [{ type: "text", text: "   " }] });
    expect(await requestReview(request, client)).toEqual({ ok: false, message: "Empty response from the AI." });
  });

  it("maps API errors to their status and hides other errors", async () => {
    const apiError = new Anthropic.APIError(529, undefined, "overloaded", undefined as any);
    const failing = (error: unknown) => ({ beta: { messages: { create: async () => { throw error; } } } });
    expect(await requestReview(request, failing(apiError))).toEqual({ ok: false, message: "AI request failed (529)." });
    expect(await requestReview(request, failing(new Error("secret detail")))).toEqual({ ok: false, message: "AI request failed." });
  });
});

describe("generateOnce", () => {
  const noSleep = async () => {};
  const claimDb = (claims: boolean[]) => {
    const calls: string[] = [];
    return {
      calls,
      db: { rpc: async (fn: string) => { calls.push(fn); return { data: fn === "wgd_claim_ai" ? claims.shift() ?? true : null, error: null }; } }
    };
  };

  it("generates when it holds the claim, then releases it", async () => {
    const { db, calls } = claimDb([true]);
    const generate = jest.fn(async () => "fresh");
    expect(await generateOnce({ db, key: "k1", readStored: async () => null, generate, busy: "busy" })).toBe("fresh");
    expect(generate).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["wgd_claim_ai", "wgd_release_ai"]);
  });

  it("returns a result stored just before the claim instead of paying again", async () => {
    const { db } = claimDb([true]);
    const generate = jest.fn(async () => "fresh");
    expect(await generateOnce({ db, key: "k2", readStored: async () => "stored", generate, busy: "busy" })).toBe("stored");
    expect(generate).not.toHaveBeenCalled();
  });

  it("waits for another device's result when the claim is taken", async () => {
    const { db, calls } = claimDb([false]);
    const generate = jest.fn(async () => "fresh");
    let reads = 0;
    const readStored = async () => (++reads >= 3 ? "theirs" : null);
    expect(await generateOnce({ db, key: "k3", readStored, generate, busy: "busy", sleep: noSleep })).toBe("theirs");
    expect(generate).not.toHaveBeenCalled();
    expect(calls).toEqual(["wgd_claim_ai"]);
  });

  it("gives up politely if the other device never finishes", async () => {
    const { db } = claimDb([false]);
    const generate = jest.fn(async () => "fresh");
    expect(await generateOnce({ db, key: "k4", readStored: async () => null, generate, busy: "busy", sleep: noSleep, waitMs: 6000, pollMs: 2000 })).toBe("busy");
    expect(generate).not.toHaveBeenCalled();
  });

  it("shares one call between simultaneous requests on the same instance", async () => {
    const { db } = claimDb([true, true]);
    let release!: (v: string) => void;
    const generate = jest.fn(() => new Promise<string>((resolve) => { release = resolve; }));
    const options = { db, key: "k5", readStored: async () => null, generate, busy: "busy" };
    const first = generateOnce(options), second = generateOnce(options);
    await new Promise((r) => setTimeout(r, 10));
    release("once");
    expect(await Promise.all([first, second])).toEqual(["once", "once"]);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("proceeds unguarded when the claim functions are missing, and releases after a failure", async () => {
    const missing = { rpc: async () => ({ data: null, error: { message: "function not found" } }) };
    expect(await generateOnce({ db: missing, key: "k6", readStored: async () => null, generate: async () => "fresh", busy: "busy" })).toBe("fresh");
    expect(await generateOnce({ db: null, key: "k7", readStored: async () => null, generate: async () => "fresh", busy: "busy" })).toBe("fresh");

    const { db, calls } = claimDb([true]);
    await expect(generateOnce({ db, key: "k8", readStored: async () => null, generate: async () => { throw new Error("boom"); }, busy: "busy" })).rejects.toThrow("boom");
    expect(calls).toEqual(["wgd_claim_ai", "wgd_release_ai"]);
  });
});
