export type ScoringVisit = {
  score: number;
  darts: number;
  remaining_after: number;
  is_bust: boolean;
  is_checkout: boolean;
};

export type LegStats = {
  totalDarts: number;
  threeDartAvg: number | null;
  firstNineAvg: number | null;
  highFinish: number | null;
  buckets: {
    t26: number;
    t60: number;
    t80: number;
    t100: number;
    t120: number;
    t140: number;
    t170: number;
    t180: number;
  };
};

// Scores a leg cannot be finished from with three darts and a double out:
// anything above 170, plus the bogey numbers.
const BOGEY_NUMBERS = new Set([169, 168, 166, 165, 163, 162, 159]);
const dartScores = [...new Set([0, 25, 50, ...Array.from({ length: 20 }, (_, i) => [i + 1, 2 * (i + 1), 3 * (i + 1)]).flat()])];
const doubles = [...Array.from({ length: 20 }, (_, i) => 2 * (i + 1)), 50];
export function canFinishFrom(remaining: number, darts = 3): boolean {
  if (!Number.isInteger(remaining) || !Number.isInteger(darts) || darts < 1 || darts > 3 || remaining < 2 || remaining > 170 || BOGEY_NUMBERS.has(remaining)) return false;
  if (doubles.includes(remaining)) return true;
  if (darts >= 2 && doubles.some(d => dartScores.includes(remaining - d))) return true;
  return darts === 3 && doubles.some(d => dartScores.some(s => dartScores.includes(remaining - d - s)));
}

export function computeRemaining(visits: ScoringVisit[], startScore = 501): number {
  if (!visits.length) return startScore;
  return visits[visits.length - 1].remaining_after;
}

export function buildLegStats(visits: ScoringVisit[]): LegStats {
  const totalDarts = visits.reduce((s, v) => s + v.darts, 0);
  const totalScore = visits.reduce((s, v) => s + (v.is_bust ? 0 : v.score), 0);
  const threeDartAvg = totalDarts > 0 ? (totalScore / totalDarts) * 3 : null;

  const first3 = visits.slice(0, 3);
  const first9Darts = first3.reduce((s, v) => s + v.darts, 0);
  const first9Score = first3.reduce((s, v) => s + (v.is_bust ? 0 : v.score), 0);
  const firstNineAvg = first9Darts === 9 ? (first9Score / first9Darts) * 3 : null;

  const checkoutVisit = visits.find((v) => v.is_checkout);
  const highFinish = checkoutVisit ? checkoutVisit.score : null;

  const buckets = { t26: 0, t60: 0, t80: 0, t100: 0, t120: 0, t140: 0, t170: 0, t180: 0 };
  visits.forEach((v) => {
    if (v.is_bust) return;
    const s = v.score;
    if (s === 26) buckets.t26++;
    if (s >= 60 && s < 80) buckets.t60++;
    if (s >= 80 && s < 100) buckets.t80++;
    if (s >= 100 && s < 120) buckets.t100++;
    if (s >= 120 && s < 140) buckets.t120++;
    if (s >= 140 && s < 170) buckets.t140++;
    if (s >= 170 && s < 180) buckets.t170++;
    if (s === 180) buckets.t180++;
  });

  return { totalDarts, threeDartAvg, firstNineAvg, highFinish, buckets };
}
