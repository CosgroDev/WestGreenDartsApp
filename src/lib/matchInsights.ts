import type { MatchSummary } from "@/data/matchSummary";
import { DIFFICULTY_MARGIN, gameDifficulty, type Difficulty } from "@/lib/opposition";

export type PracticeSuggestion = {
  title: string;
  href: string;
  reason: string;
};

export type MatchInsights = {
  headline: string;
  strengths: string[];
  workOns: string[];
  practice: PracticeSuggestion[];
  /** How hard the game was against the season's typical opponent; null when it can't be judged. */
  difficulty: Difficulty | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Rule-based darts coaching read of a completed match. Looks at the dynamics
 * that decide pub-league legs: heavy scoring (treble 20 consistency), how fast
 * a leg starts (first 9), and conversion once on a finish (checkout %, busts),
 * all set against what the opponent threw when their visits were recorded.
 * `fieldAvg` is the average of every opponent faced this season.
 */
export function analyseMatch(m: MatchSummary, fieldAvg: number | null = null): MatchInsights {
  const strengths: string[] = [];
  const workOns: string[] = [];
  const practice: PracticeSuggestion[] = [];
  const addPractice = (p: PracticeSuggestion) => {
    if (!practice.some((x) => x.title === p.title)) practice.push(p);
  };

  const tda = m.threeDartAvg;
  const f9 = m.firstNineAvg;

  // --- The opposition: was it a hard game, and who out-scored whom ---
  const opp = m.opponent;
  const oppAvg = opp?.threeDartAvg ?? null;
  const ownAvg = opp?.playerThreeDartAvg ?? null;
  const difficulty = gameDifficulty(oppAvg, fieldAvg);
  if (oppAvg !== null && ownAvg !== null) {
    const gap = ownAvg - oppAvg;
    const versus = `${round1(ownAvg)} to ${m.opponentPlayer}'s ${round1(oppAvg)}`;
    if (m.result !== "loss" && gap <= -DIFFICULTY_MARGIN) {
      strengths.push(`Out-scored ${versus} and still took ${m.result === "win" ? "the match" : "a leg"} — that was won on the finish.`);
    } else if (m.result === "loss" && gap >= DIFFICULTY_MARGIN) {
      workOns.push(`Out-scored the opponent ${versus} and lost — the legs went on the finish, not the scoring.`);
      addPractice({
        title: "121 Challenge",
        href: "/practice/121",
        reason: "The scoring was good enough to win; this is about closing legs out once the finish is on."
      });
    } else if (m.result === "win" && gap >= DIFFICULTY_MARGIN) {
      strengths.push(`Out-scored the opponent ${versus}.`);
    }
    if (difficulty === "hard" && fieldAvg !== null) {
      strengths.push(
        m.result === "loss"
          ? `A hard game: ${m.opponentPlayer} averaged ${round1(oppAvg)}, well above the ${round1(fieldAvg)} of a typical opponent this season.`
          : `${m.result === "win" ? "Beat" : "Held"} an opponent averaging ${round1(oppAvg)}, well above the ${round1(fieldAvg)} of a typical opponent this season.`
      );
    } else if (difficulty === "easy" && fieldAvg !== null && m.result !== "win") {
      workOns.push(
        `${m.opponentPlayer} averaged ${round1(oppAvg)}, below the ${round1(fieldAvg)} of a typical opponent this season — this one was there to be won.`
      );
    }
  }

  // --- Scoring power ---
  if (tda !== null) {
    if (tda >= 60) strengths.push(`Heavy scoring — a ${round1(tda)} three-dart average is league-winning stuff.`);
    else if (tda >= 45) strengths.push(`Solid scoring at a ${round1(tda)} three-dart average.`);
    else {
      workOns.push(
        `A ${round1(tda)} three-dart average left a lot of work on each leg — grouping around treble 20 is the quickest win.`
      );
      addPractice({
        title: "Practice 501 session",
        href: "/practice",
        reason: "Volume on the 20 bed: play best-of-5 legs and count your 60+ visits."
      });
    }
  }

  // --- Leg starts: first 9 vs overall ---
  if (tda !== null && f9 !== null) {
    if (f9 >= tda + 8) {
      strengths.push(`Fast starter — first 9 of ${round1(f9)} well above the overall average.`);
      if (tda < f9 - 10) {
        workOns.push(
          `The scoring fades after the first 9 (${round1(f9)} down to ${round1(tda)}) — often a sign of pressure once the finish comes into range.`
        );
      }
    } else if (f9 <= tda - 8) {
      workOns.push(
        `Slow starts — first 9 of ${round1(f9)} against a ${round1(tda)} overall. The first three visits set up the whole leg.`
      );
      addPractice({
        title: "Practice 501 session",
        href: "/practice",
        reason: "Focus purely on the first 9 darts of each leg — aim to be under 300 after three visits."
      });
    }
  }

  // --- Finishing ---
  if (m.checkoutAttempts >= 2 && m.checkoutPct !== null) {
    const co = Math.round(m.checkoutPct);
    if (co >= 50) {
      strengths.push(`Clinical on the doubles — ${m.checkoutHits}/${m.checkoutAttempts} checkout chances taken (${co}%).`);
    } else if (co < 25) {
      workOns.push(
        `Only ${m.checkoutHits} of ${m.checkoutAttempts} visits on a finish converted (${co}%) — legs were there to be won earlier.`
      );
      addPractice({
        title: "121 Challenge",
        href: "/practice/121",
        reason: "Built exactly for this: repeat checkouts from 121 up to 170 until doubles feel routine."
      });
    }
  }
  if (m.busts >= 2) {
    workOns.push(
      `${m.busts} busts — work out the route before throwing so the last dart is always on a double, not over it.`
    );
    addPractice({
      title: "121 Challenge",
      href: "/practice/121",
      reason: "Forces route planning on awkward numbers, which is where busts come from."
    });
  }
  if (m.highFinish !== null && m.highFinish >= 80) {
    strengths.push(`A ${m.highFinish} finish is a proper highlight — big checkouts win tight matches.`);
  }

  // --- Consistency markers ---
  if (m.bands.oneEighty > 0) {
    strengths.push(`${m.bands.oneEighty} × 180 — maximum scoring under match pressure.`);
  } else if (m.bands.oneFortyPlus > 0) {
    strengths.push(`${m.bands.oneFortyPlus} visit${m.bands.oneFortyPlus > 1 ? "s" : ""} of 140+ shows the big scores are there.`);
  }
  if (m.bands.twentySix >= 2) {
    workOns.push(
      `${m.bands.twentySix} × 26 (the classic 20-5-1) — when a dart drifts, switch to 19s rather than chasing the 20.`
    );
    addPractice({
      title: "Round the board in Killer",
      href: "/pub-games/killer",
      reason: "Hitting specific numbers on demand sharpens accuracy away from the 20 segment."
    });
  }
  if (m.bestLegDarts !== null && m.bestLegDarts <= 18) {
    strengths.push(`Best leg won in ${m.bestLegDarts} darts — genuinely quick.`);
  }

  // --- Headline ---
  const score = `${m.westLegs}-${m.oppLegs}`;
  const averaging =
    tda === null ? "" : ` averaging ${round1(tda)}${oppAvg !== null ? ` to ${round1(oppAvg)}` : ""}`;
  const headline =
    m.result === "win"
      ? `${m.westPlayerName} beat ${m.opponentPlayer} ${score}${averaging}.`
      : m.result === "loss"
      ? `${m.westPlayerName} went down ${score} to ${m.opponentPlayer}${averaging}.`
      : `${m.westPlayerName} drew ${score} with ${m.opponentPlayer}${averaging}.`;

  if (!strengths.length && tda !== null) {
    strengths.push("Every match scored is data in the bank — the trends on the dashboard do the talking.");
  }
  if (!workOns.length && tda !== null) {
    workOns.push("Nothing glaring this match — keep the routine going.");
  }

  return { headline, strengths, workOns, practice: practice.slice(0, 3), difficulty };
}
