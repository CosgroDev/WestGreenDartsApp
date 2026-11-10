/**
 * Opponent-side statistics: what the opposition threw, how the player did
 * against it, and whether a game was a hard or an easy one.
 *
 * Opponent visits are stored in scoring_events with thrower "opponent". Legs
 * scored before that was recorded have none, so every figure here is over
 * the legs where opponent visits exist and is null when there are none.
 */

export type SideTotals = { points: number; darts: number };

type TotalsEvent = { game_id: string; score: number; darts: number; is_bust: boolean };

export const threeDartAvg = (t: SideTotals | undefined | null) =>
  t && t.darts > 0 ? (t.points / t.darts) * 3 : null;

/** Points and darts per leg for one side. A bust counts its darts but no points. */
export function totalsByGame(events: TotalsEvent[]): Map<string, SideTotals> {
  const totals = new Map<string, SideTotals>();
  events.forEach((e) => {
    const t = totals.get(e.game_id) ?? { points: 0, darts: 0 };
    if (!e.is_bust && typeof e.score === "number") t.points += e.score;
    if (typeof e.darts === "number") t.darts += e.darts;
    totals.set(e.game_id, t);
  });
  return totals;
}

export type OppositionSummary = {
  /** Legs that have opponent visits recorded. */
  opp_legs: number;
  /** The opponents' combined three-dart average over those legs. */
  opp_three_dart_avg: number | null;
  /** The player's (or team's) average over the same legs minus the opponents'. */
  avg_vs_opp: number | null;
};

export const NO_OPPOSITION: OppositionSummary = { opp_legs: 0, opp_three_dart_avg: null, avg_vs_opp: null };

/** Like-for-like comparison over the given legs: only legs with opponent visits count on either side. */
export function summariseOpposition(
  gameIds: Iterable<string>,
  own: Map<string, SideTotals>,
  opponent: Map<string, SideTotals>
): OppositionSummary {
  const ownTotal: SideTotals = { points: 0, darts: 0 };
  const oppTotal: SideTotals = { points: 0, darts: 0 };
  let legs = 0;
  for (const id of gameIds) {
    const opp = opponent.get(id);
    if (!opp || opp.darts === 0) continue;
    legs += 1;
    oppTotal.points += opp.points;
    oppTotal.darts += opp.darts;
    const mine = own.get(id);
    if (mine) {
      ownTotal.points += mine.points;
      ownTotal.darts += mine.darts;
    }
  }
  const oppAvg = threeDartAvg(oppTotal);
  const ownAvg = threeDartAvg(ownTotal);
  return {
    opp_legs: legs,
    opp_three_dart_avg: oppAvg,
    avg_vs_opp: oppAvg !== null && ownAvg !== null ? ownAvg - oppAvg : null
  };
}

/** Opponent legs needed before the season's opposition average is a fair yardstick. */
export const MIN_FIELD_LEGS = 10;
/** How far from the yardstick an opponent has to throw for the game to count as hard or easy. */
export const DIFFICULTY_MARGIN = 4;

/**
 * The yardstick for "hard or easy": the average of every opponent the team
 * has faced this season. Null until there are enough legs to trust it.
 */
export const fieldAverage = (season: OppositionSummary | null | undefined) =>
  season && season.opp_legs >= MIN_FIELD_LEGS ? season.opp_three_dart_avg : null;

export type Difficulty = "hard" | "even" | "easy";

/** How hard a game was: the opponent's average against the season's typical opponent. */
export function gameDifficulty(
  opponentAvg: number | null | undefined,
  field: number | null | undefined
): Difficulty | null {
  if (opponentAvg === null || opponentAvg === undefined || field === null || field === undefined) return null;
  if (opponentAvg >= field + DIFFICULTY_MARGIN) return "hard";
  if (opponentAvg <= field - DIFFICULTY_MARGIN) return "easy";
  return "even";
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { hard: "Hard game", even: "Even game", easy: "Easy game" };

export const DIFFICULTY_TONE: Record<Difficulty, string> = {
  hard: "border-red-200 bg-red-50 text-red-700",
  even: "border-slate-200 bg-slate-50 text-slate-600",
  easy: "border-emerald-200 bg-emerald-50 text-emerald-700"
};

/** "+3.2" / "-1.5" / "–" for an average difference. */
export const signed = (n: number | null | undefined) =>
  n === null || n === undefined ? "–" : `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1)}`;
