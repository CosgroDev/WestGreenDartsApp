// Limits PIN guesses per client. Counters live in the database so they hold
// across serverless instances; if the limiter functions are unavailable (the
// migration has not been applied yet) a per-instance fallback is used so the
// PIN gate is never left unthrottled.

type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
export type LimiterDb = { rpc: Rpc } | null;

const FREE_ATTEMPTS = 5;
const BASE_LOCK_SECONDS = 30;
const MAX_LOCK_SECONDS = 900;
const RESET_AFTER_MS = 60 * 60 * 1000;

/** Lock length after the nth consecutive failure. Mirrors wgd_pin_failed. */
export function lockSecondsAfter(failures: number): number {
  if (failures < FREE_ATTEMPTS) return 0;
  return Math.min(MAX_LOCK_SECONDS, BASE_LOCK_SECONDS * 2 ** Math.min(failures - FREE_ATTEMPTS, 10));
}

type Entry = { failures: number; lockedUntil: number; updatedAt: number };
const memory = new Map<string, Entry>();

const memoryLimiter = {
  locked(key: string, now: number) {
    return Math.max(0, Math.ceil(((memory.get(key)?.lockedUntil ?? 0) - now) / 1000));
  },
  failed(key: string, now: number) {
    const previous = memory.get(key);
    const failures = previous && now - previous.updatedAt < RESET_AFTER_MS ? previous.failures + 1 : 1;
    const wait = lockSecondsAfter(failures);
    memory.set(key, { failures, lockedUntil: wait ? now + wait * 1000 : 0, updatedAt: now });
    if (memory.size > 5000) for (const [k, v] of memory) if (now - v.updatedAt > RESET_AFTER_MS) memory.delete(k);
    return wait;
  },
  succeeded(key: string) {
    memory.delete(key);
  }
};

async function call(db: LimiterDb, fn: string, key: string): Promise<number | null> {
  if (!db) return null;
  try {
    const { data, error } = await db.rpc(fn, { p_client: key });
    if (error) return null;
    return typeof data === "number" ? data : 0;
  } catch {
    return null;
  }
}

/** Seconds this client must wait before another attempt (0 = may try now). */
export async function pinLockSeconds(db: LimiterDb, key: string, now = Date.now()): Promise<number> {
  const remote = await call(db, "wgd_pin_locked", key);
  return Math.max(remote ?? 0, memoryLimiter.locked(key, now));
}

/** Record a failed attempt; returns the lock now in force, in seconds. */
export async function pinFailed(db: LimiterDb, key: string, now = Date.now()): Promise<number> {
  const remote = await call(db, "wgd_pin_failed", key);
  return remote ?? memoryLimiter.failed(key, now);
}

export async function pinSucceeded(db: LimiterDb, key: string): Promise<void> {
  memoryLimiter.succeeded(key);
  await call(db, "wgd_pin_succeeded", key);
}

export function resetPinLimiterForTests() {
  memory.clear();
}

export function lockMessage(seconds: number): string {
  if (seconds < 60) return `Too many attempts. Try again in ${seconds} seconds.`;
  const minutes = Math.ceil(seconds / 60);
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}
