type CelebrationVisit = { darts: number; isCheckout: boolean };

export function isPeaCelebration(
  status: string | undefined,
  winner: string | undefined,
  visits: CelebrationVisit[]
): boolean {
  const darts = visits.reduce((total, visit) => total + visit.darts, 0);
  return status === "completed" && winner === "west_green" &&
    visits.some((visit) => visit.isCheckout) && darts > 0 && darts < 20;
}
