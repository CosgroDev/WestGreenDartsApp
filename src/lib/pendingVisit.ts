// The one league visit that has been sent but not yet confirmed. It is kept in
// local storage so that if the page reloads while the connection is down, the
// visit is sent again with the same request ID. The server treats a repeated
// request ID as the same command, so a replay can never record a visit twice.

export type PendingVisit = {
  gameId: string;
  score: number;
  side: "west" | "opponent";
  darts: number;
  revision: number;
  requestId: string;
  at: number;
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY = "wgd_pending_visit";
/** After this long the leg has almost certainly moved on; replaying would only be rejected. */
export const PENDING_VISIT_MAX_AGE_MS = 10 * 60 * 1000;

const storage = (): Store | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

export function savePendingVisit(visit: Omit<PendingVisit, "at">, store: Store | null = storage(), now = Date.now()) {
  try {
    store?.setItem(KEY, JSON.stringify({ ...visit, at: now }));
  } catch {
    // Storage full or blocked: scoring still works, only reload recovery is lost.
  }
}

export function clearPendingVisit(store: Store | null = storage()) {
  try {
    store?.removeItem(KEY);
  } catch {
    // Nothing to do.
  }
}

/** The unconfirmed visit for this game, if there is a recent, well-formed one. Anything else is discarded. */
export function readPendingVisit(gameId: string, store: Store | null = storage(), now = Date.now()): PendingVisit | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<PendingVisit>;
    const valid =
      typeof v.gameId === "string" && typeof v.requestId === "string" &&
      Number.isInteger(v.score) && v.score! >= 0 && v.score! <= 180 &&
      Number.isInteger(v.darts) && v.darts! >= 1 && v.darts! <= 3 &&
      Number.isInteger(v.revision) && (v.side === "west" || v.side === "opponent") &&
      typeof v.at === "number";
    if (!valid || now - v.at! > PENDING_VISIT_MAX_AGE_MS || now < v.at!) {
      clearPendingVisit(store);
      return null;
    }
    // A visit for another game stays put: that game's screen may still recover it.
    return v.gameId === gameId ? (v as PendingVisit) : null;
  } catch {
    clearPendingVisit(store);
    return null;
  }
}
