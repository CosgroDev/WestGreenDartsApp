// Doubles Switch practice — shared constants and helpers.
//
// Players rotate through the common finishing doubles in a fixed order to get
// used to "switching" between doubles, then receive random doubles from the
// same set endlessly.

// The fixed rotation: D10, D20, D12, D18, D9, D8, D4, D2, D1, D16, D6.
export const DOUBLES_SEQUENCE = [10, 20, 12, 18, 9, 8, 4, 2, 1, 16, 6];

// Pick a random double from the sequence, avoiding an immediate repeat so the
// player keeps switching.
export function nextRandomDouble(exclude: number): number {
  const pool = DOUBLES_SEQUENCE.filter((d) => d !== exclude);
  const list = pool.length ? pool : DOUBLES_SEQUENCE;
  return list[Math.floor(Math.random() * list.length)];
}

// Points reward hitting the double earlier in the visit:
// 1st dart = 3, 2nd = 2, 3rd = 1, missed all three = 0.
export function pointsForDart(dartHit: number): number {
  if (dartHit === 1) return 3;
  if (dartHit === 2) return 2;
  if (dartHit === 3) return 1;
  return 0;
}

// Given how many attempts a player has completed, what is their next target and
// phase. The first DOUBLES_SEQUENCE.length rounds follow the fixed order; after
// that, random doubles are served.
export function nextTargetForRound(
  nextRoundIndex: number,
  currentTarget: number
): { target: number; phase: "sequence" | "random" } {
  if (nextRoundIndex < DOUBLES_SEQUENCE.length) {
    return { target: DOUBLES_SEQUENCE[nextRoundIndex], phase: "sequence" };
  }
  return { target: nextRandomDouble(currentTarget), phase: "random" };
}
