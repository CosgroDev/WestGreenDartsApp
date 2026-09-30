type CelebrationVisit = { darts: number; isCheckout: boolean };
export type LegCelebration = "peas" | "log";

export function getLegCelebration(
  status: string | undefined,
  winner: string | undefined,
  visits: CelebrationVisit[]
): LegCelebration | null {
  if (status !== "completed" || winner !== "west_green" ||
      !visits.some((visit) => visit.isCheckout)) return null;
  const darts = visits.reduce((total, visit) => total + visit.darts, 0);
  if (darts > 0 && darts < 20) return "peas";
  if (darts >= 20 && darts <= 25) return "log";
  return null;
}

export function isPeaCelebration(
  status: string | undefined,
  winner: string | undefined,
  visits: CelebrationVisit[]
): boolean {
  return getLegCelebration(status, winner, visits) === "peas";
}
