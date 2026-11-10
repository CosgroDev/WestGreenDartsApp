import { PENDING_VISIT_MAX_AGE_MS, clearPendingVisit, readPendingVisit, savePendingVisit } from "@/lib/pendingVisit";

const memoryStore = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); }
  };
};
const visit = { gameId: "g1", score: 60, side: "west" as const, darts: 3, revision: 4, requestId: "req-1" };

describe("pending visit", () => {
  it("returns the saved visit for its own game with the original request ID", () => {
    const store = memoryStore();
    savePendingVisit(visit, store, 1000);
    expect(readPendingVisit("g1", store, 2000)).toEqual({ ...visit, at: 1000 });
  });

  it("leaves another game's visit alone", () => {
    const store = memoryStore();
    savePendingVisit(visit, store, 1000);
    expect(readPendingVisit("g2", store, 2000)).toBeNull();
    expect(readPendingVisit("g1", store, 2000)).not.toBeNull();
  });

  it("discards a visit that is too old to replay safely", () => {
    const store = memoryStore();
    savePendingVisit(visit, store, 0);
    expect(readPendingVisit("g1", store, PENDING_VISIT_MAX_AGE_MS + 1)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("discards malformed or tampered records", () => {
    for (const bad of ["not json", JSON.stringify({ ...visit, at: 1, score: 181 }), JSON.stringify({ ...visit, at: 1, darts: 4 }),
      JSON.stringify({ ...visit, at: 1, side: "north" }), JSON.stringify({ gameId: "g1" }), JSON.stringify({ ...visit, at: 5000 })]) {
      const store = memoryStore();
      store.setItem("wgd_pending_visit", bad);
      expect(readPendingVisit("g1", store, 2000)).toBeNull();
      expect(store.data.size).toBe(0);
    }
  });

  it("clears, and tolerates storage that is missing or throws", () => {
    const store = memoryStore();
    savePendingVisit(visit, store, 1);
    clearPendingVisit(store);
    expect(readPendingVisit("g1", store, 2)).toBeNull();

    const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => savePendingVisit(visit, broken)).not.toThrow();
    expect(readPendingVisit("g1", broken)).toBeNull();
    expect(() => savePendingVisit(visit, null)).not.toThrow();
    expect(readPendingVisit("g1", null)).toBeNull();
  });
});
