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
