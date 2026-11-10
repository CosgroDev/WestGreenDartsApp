import Anthropic from "@anthropic-ai/sdk";
import { REVIEW_FALLBACK_MODEL, REVIEW_MODEL } from "./aiCoaching";

/**
 * The one place the app calls the model for a written review. Every review
 * (match, fixture night, season, player) goes through requestReview, and
 * generateOnce makes sure simultaneous requests for the same review share one
 * paid call.
 */

export type ReviewText = { ok: true; text: string } | { ok: false; message: string };

type ReviewRequest = {
  system: string;
  payload: unknown;
  effort: "low" | "medium" | "high";
  /** What is being reviewed, for the refusal message: "match", "season"… */
  subject: string;
  maxTokens?: number;
};

type MessagesClient = { beta: { messages: { create: (body: any) => Promise<any> } } };

export async function requestReview(
  { system, payload, effort, subject, maxTokens = 16000 }: ReviewRequest,
  client: MessagesClient = new Anthropic()
): Promise<ReviewText> {
  try {
    const response = await client.beta.messages.create({
      model: REVIEW_MODEL,
      max_tokens: maxTokens,
      thinking: { type: "adaptive" },
      output_config: { effort },
      betas: ["server-side-fallback-2026-06-01"],
      fallbacks: [{ model: REVIEW_FALLBACK_MODEL }],
      system,
      messages: [{ role: "user", content: JSON.stringify(payload) }]
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, message: `The AI declined to review this ${subject}.` };
    }
    // A review cut off at the token limit would be stored and shown forever.
    if (response.stop_reason === "max_tokens") {
      return { ok: false, message: `The AI ran out of room writing this ${subject} review. Try again.` };
    }
    const text = (response.content as { type: string; text?: string }[])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("")
      .trim();
    return text ? { ok: true, text } : { ok: false, message: "Empty response from the AI." };
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return { ok: false, message: `AI request failed (${err.status}).` };
    }
    return { ok: false, message: "AI request failed." };
  }
}

type ClaimDb = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
} | null;

type OnceOptions<R> = {
  db: ClaimDb;
  /** Identifies the thing being generated, e.g. `match:<id>`. */
  key: string;
  /** The stored result if one already exists for the current data, else null. */
  readStored: () => Promise<R | null>;
  /** Calls the model and stores the result. */
  generate: () => Promise<R>;
  /** Returned when another request holds the claim and has not finished in time. */
  busy: R;
  waitMs?: number;
  pollMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Run `generate` at most once per key at a time. Requests on the same server
 * instance share one promise; requests on other instances are held off by a
 * database claim and wait for the stored result instead of paying again.
 * If the claim functions are unavailable the request proceeds unguarded.
 */
export async function generateOnce<R>(options: OnceOptions<R>): Promise<R> {
  const running = inFlight.get(options.key) as Promise<R> | undefined;
  if (running) return running;
  const promise = claimAndGenerate(options).finally(() => inFlight.delete(options.key));
  inFlight.set(options.key, promise);
  return promise;
}

async function claimAndGenerate<R>({ db, key, readStored, generate, busy, waitMs = 45_000, pollMs = 2_000, sleep }: OnceOptions<R>): Promise<R> {
  const pause = sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (!db) return { data: null, failed: true };
    try {
      const { data, error } = await db.rpc(fn, args);
      return { data, failed: Boolean(error) };
    } catch {
      return { data: null, failed: true };
    }
  };

  const claim = await rpc("wgd_claim_ai", { p_key: key });
  if (!claim.failed && claim.data === false) {
    // Someone else is generating it. Wait for their result rather than paying twice.
    for (let waited = 0; waited < waitMs; waited += pollMs) {
      await pause(pollMs);
      const stored = await readStored();
      if (stored) return stored;
    }
    return busy;
  }

  try {
    // The other request may have finished between our cache check and the claim.
    const stored = await readStored();
    if (stored) return stored;
    return await generate();
  } finally {
    if (!claim.failed) await rpc("wgd_release_ai", { p_key: key });
  }
}
