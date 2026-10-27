import type { LegSummary } from "@/data/matchSummary";
import type { PlayerCard, PlayerGameStat } from "@/data/stats";
import { canFinishFrom } from "@/lib/scoringUtils";

/**
 * Shared building blocks for the AI reviews (match, fixture night, season).
 *
 * The reviews felt samey because every prompt carried the same darts trivia
 * (26s, switching to 19s), the same fixed three-paragraph shape, and the same
 * three drills — and the model only ever saw one night in isolation, so it had
 * no yardstick for "good for this player". The fix is twofold: give the model
 * derived numbers it can't easily work out itself (where legs were lost, how
 * this compares to the player's own season), and tell it to pick the few
 * things that actually defined the night instead of walking every stat.
 */

const round1 = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10) / 10;

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

const delta = (now: number | null | undefined, base: number | null | undefined) =>
  now === null || now === undefined || base === null || base === undefined ? null : round1(now - base);

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/**
 * Reviews are short (~200-280 words) but need careful reading of the numbers.
 * Opus 5.5 at medium effort gets that right for less than Opus 4.8 cost, and
 * each review is generated once and cached, so per-call cost stays small.
 */
export const REVIEW_MODEL = "claude-opus-5-5";
export const REVIEW_EFFORT = "medium" as const;
/**
 * The player insight digs through a whole season of visits for patterns, is
 * asked for on demand and cached until the player plays again, so it gets
 * more thinking than the per-match reviews.
 */
export const PLAYER_INSIGHT_EFFORT = "high" as const;
/** If a request is declined by a safety classifier, the API reruns it here. */
export const REVIEW_FALLBACK_MODEL = "claude-opus-4-8";

// ---------------------------------------------------------------------------
// Prompt text
// ---------------------------------------------------------------------------

export const DARTS_BENCHMARKS = `How to read the numbers — calibrate to pub-league 501 double-out, not the TV game:
- Three-dart average: under 35 is a hard night, 35-45 is a typical pub player, 45-55 is strong, 55-65 is county standard, 65+ is exceptional. One match swings a few points either way, so ±3 against a player's own norm is noise; ±6 or more is a genuine story.
- First nine vs overall: a first nine well above the overall average means scoring tails off once the finish comes into view (set-up visits, or tightening under pressure). Well below means slow starts that hand the opponent a head start.
- Checkout %: counts every visit that began on a finishable number. 20-30% is normal at this level, 35%+ is good, 45%+ is clinical. With fewer than 4 attempts the percentage is meaningless — talk about the actual chances instead.
- A leg lost after having visits on a finish is the most painful and most fixable kind of loss. A leg lost without ever reaching a finish means the player was simply out-scored.
- Busts almost always point to route planning, not throwing.
- Low visits (under 40) and 26s (20-5-1) show grouping coming off the treble. Only mention 26s when they are frequent (roughly one visit in eight or more) — a single 26 is not a story.
- Opponent visits are not recorded. You only know who won each leg — never state or guess what an opponent averaged, scored or checked out.`;

export const PRACTICE_OPTIONS = `Practice options in the team's app — recommend one only if it targets the specific weakness you identified, and give a concrete target (e.g. "three rounds, aim to finish 6 of 10"):
- 121 Challenge: checkouts climbing from 121 towards 170 — big finishes and planning a three-dart route.
- Random Checkout: a random finish anywhere from 2 to 170 — reading the board and choosing routes under variety.
- Doubles Switch: a team doubles drill, rotating then random doubles — raw double hitting.
- Practice 501: best of 1/3/5/7 legs from 301/501/701 — scoring volume, leg starts and full-leg rhythm.
- Killer (pub game): hitting specific numbers on demand — accuracy away from the 20s.
Classic drills outside the app are fine when they fit better: Bob's 27 (doubles under pressure), around the clock on doubles, ten visits at treble 20 counting how many make 60+, or set-up practice (leaving 32/40 from 60-100).`;

export const WRITING_RULES = `How to write it:
- Study the data first, then pick the two or three things that genuinely decided the outcome. Do not walk through every stat. An insight is a number plus what it meant for how the legs played out.
- Every claim must rest on a number in the data. Never invent stats, darts at doubles, segments hit, or anything about the opponent's throwing.
- Be honest. If it was a poor night, say so plainly and kindly — no hollow praise. If it was excellent, don't manufacture a weakness; the improvement point can be about sustaining it or the next step up.
- Praise specifically: name exactly what went well and why it mattered, so the player knows what to keep doing.
- Where a season baseline is provided, use it — "your best average this season" or "six below your norm" means far more than a raw number.
- Sound like a knowledgeable team-mate, not a report. Vary how you open; don't start with "[Name], ..." or with the score. Avoid stock filler such as "data in the bank", "keep the routine going", "proper highlight", "solid performance", "great effort" and "drifting off the 20 bed".
- Plain text only: no markdown, asterisks, hashes or bullet symbols.`;

export const MATCH_SYSTEM_PROMPT = `You are an experienced darts coach writing a short, personal review of one West Green Darts player's singles match (pub-league 501, double out). You are addressing the player directly by name.

The match arrives as JSON:
- "match": the result and match-level stats for the West Green player.
- "derived": numbers worked out from every visit — scoring-phase average (visits started above 170), darts needed to reach a finish, darts spent on the finish in legs won, legs lost while on a finish, low-scoring visits, and a per-leg story.
- "seasonBaseline": the player's own season norm (when available), with "vsSeason" giving tonight minus their norm. "recentForm" is the mean leg average of their last few legs before this match.
- "legs": every visit with the score left afterwards, so you can see exactly where a leg turned.

${DARTS_BENCHMARKS}

${WRITING_RULES}

${PRACTICE_OPTIONS}

Format — start with one or two unlabelled sentences on the story of the match: where it was won or lost. Then three labelled sections, each starting on a new line with its label exactly as written:
Keep doing: the one or two things that went genuinely well, with the numbers, and why they matter.
Work on: the single most important thing to improve, with the evidence. If nothing was weak, say what would take them up a level.
Practice: one drill with a specific target that addresses the "Work on" point.

Keep it under 200 words.`;

export const FIXTURE_SYSTEM_PROMPT = `You are the West Green Darts captain writing the team's review of a completed league night. A fixture is a set of singles matches (pub-league 501, double out); each West Green player plays one opponent over a set of legs.

The night arrives as JSON:
- "fixture": the team result and team-wide aggregates.
- "matches": one entry per West Green player — their result and stats, a "derived" block (legs lost while on a finish, darts needed to reach a finish, low visits) and, when available, "vsSeason" (tonight minus that player's season norm).
- "teamDerived": the same derived numbers rolled up for the team, plus who over- and under-performed against their own season norm.

${DARTS_BENCHMARKS}

${WRITING_RULES}
- Mention players by name when it adds something — whoever won the key matches, whoever played well above their norm, and (kindly) where a match slipped away. Every player who played well deserves a mention; don't single anyone out harshly.
- Decide whether the night was won or lost on scoring or on finishing, and say so.

${PRACTICE_OPTIONS}

Format — start with one or two unlabelled sentences on how the night went and where it was decided. Then three labelled sections, each starting on a new line with its label exactly as written:
Keep doing: what the team did well as a unit, and the individual performances that stood out, with numbers.
Work on: the single biggest collective area to improve, with the evidence.
Practice: one or two drills for the squad this week, with specific targets.

Keep it under 260 words.`;

export const SEASON_SYSTEM_PROMPT = `You are the West Green Darts captain writing the season-to-date review. Each league night (fixture) is up to six singles matches (pub-league 501, double out).

The season arrives as JSON:
- "season": the fixture-by-fixture results in date order and the overall record.
- "team": team-wide aggregates across every completed leg.
- "players": per-player season stats with sample sizes ("legs", "checkoutAttempts") and a "form" block comparing their recent legs with their earlier ones.
- "previousSummary": the review you wrote last time (may be null). Do not repeat its points — say what has changed since. If something it flagged has improved or worsened, call that out.

${DARTS_BENCHMARKS}

${WRITING_RULES}
- Treat small samples with care: a player with only a handful of legs or checkout attempts shouldn't be judged on percentages.
- Look for trends rather than snapshots: results across the run of fixtures, players whose form is rising or dipping, and whether the team is losing legs on scoring or on finishing.

${PRACTICE_OPTIONS}

Format — start with one or two unlabelled sentences on where the season stands and the direction it's heading. Then three labelled sections, each starting on a new line with its label exactly as written:
Keep doing: the team strengths and the players in form, with numbers.
Work on: the single biggest collective area holding the team back, with the evidence.
Practice: one or two drills for the squad, with specific targets.

Keep it under 280 words.`;

export const PLAYER_SYSTEM_PROMPT = `You are an experienced darts coach who has studied every visit one West Green Darts player has thrown this season (pub-league 501, double out), writing them a personal season profile. You are addressing the player directly by name. This is the deepest read they get all season, so it should tell them things about their game they could not see from the scoresheet.

The season arrives as JSON:
- "player": name and headline season stats with sample sizes.
- "derived": worked out from every visit —
  - "record" and "matchTimeline": every match in date order with legs, average, first nine, checkouts (hits/attempts) and best leg.
  - "wonVsLostLegs": scoring in legs won against legs lost — a big gap means results hinge on scoring; a small gap means legs are decided on the finish.
  - "throwOrder": leg record and average throwing first vs second.
  - "pressure": opening legs, deciders (the final leg of a match that was level going into it), legs played a leg behind or ahead, and comeback wins after losing the first leg.
  - "venue": home vs away.
  - "consistency": spread of leg averages (a standard deviation above about 9 is streaky, under about 5 is very steady), best and worst legs.
  - "scoring": per-visit rates, scoring-phase average (visits started above 170, so set-up shots don't drag it down), darts needed to reach a finish, low visits, legs lost on a finish vs legs lost without ever reaching one.
  - "finishing": success by the range the visit started from, busts, one-dart finishes, favourite checkouts, and "medianFirstFinishLeft" — the number typically left on first reaching a finish (a high number means the set-up shot is costing them; 40 or under means they leave themselves doubles).
  - "speed": darts per leg won.
  - "trend": first half vs second half of the season, and the last three matches vs everything before.
- "squad": rank (1 = best) against the rest of the squad and the squad figure for each headline metric, the leaderboard performance rating and the player's flair "aura".
- "previousInsight": what you told them last time (may be null). Don't repeat it — say what has changed since. If something it flagged has moved, call that out with the numbers.

${DARTS_BENCHMARKS}

${WRITING_RULES}
- Hunt for the non-obvious: a gap between throwing first and second, deciders, a finishing range that leaks, a split between home and away, a first nine that fades, a streak in the timeline. Lead with whatever is most striking and most useful. Only report a split when both sides have enough legs to mean something (roughly 5+ legs each, 8+ finishing visits in a range); otherwise leave it out.
- Use the squad context to make numbers mean something ("second-best first nine in the squad"), but this is about the player, not a ranking table.
- Treat small samples honestly: with only a few matches, say it is early and keep conclusions tentative.

${PRACTICE_OPTIONS}

Format — start with two or three unlabelled sentences that capture who this player is as a darter this season and the direction they're heading. Then four labelled sections, each starting on a new line with its label exactly as written:
Strengths: the two or three things that win them legs, with numbers.
Holding you back: the single biggest thing costing them legs, with the evidence and what it means in practice.
Hidden pattern: one thing from the splits, ranges or timeline they probably haven't noticed, and why it matters. If nothing meaningful stands out, use this for the trend instead.
Practice plan: one or two drills with specific targets that attack the "Holding you back" point.

Keep it under 330 words.`;

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------

export type LegStory = {
  leg: number;
  won: boolean;
  darts: number;
  threeDartAvg: number | null;
  /** Darts thrown before the first visit that started on a finishable number. */
  dartsToReachFinish: number | null;
  /** Visits that started on a finishable number. */
  visitsOnFinish: number;
  checkout: number | null;
  busts: number;
};

export type MatchDerived = {
  /** Average of visits that started above 170 — pure scoring, no set-up shots. */
  scoringPhaseAvg: number | null;
  /** Share of scoring-phase visits that made 60+. */
  scoringPhase60PlusPct: number | null;
  /** Scoring-phase visits under 40 (excluding busts). */
  lowVisits: number;
  scoringPhaseVisits: number;
  avgDartsToReachFinish: number | null;
  /** In legs won: darts from the first visit on a finish to the checkout. */
  avgDartsOnFinishInLegsWon: number | null;
  legsLostWithFinishChances: number;
  /** Visits on a finish that came to nothing in legs that were lost. */
  missedFinishVisitsInLostLegs: number;
  legsLostNeverOnFinish: number;
  bestVisit: number | null;
  legStory: LegStory[];
};

const remainingBefore = (v: LegSummary["visits"][number]) =>
  v.isBust ? v.remainingAfter : v.remainingAfter + v.score;

/** Derived, visit-level read of a match that the raw aggregates don't show. */
export function deriveMatch(legs: LegSummary[]): MatchDerived {
  let scoringPoints = 0;
  let scoringDarts = 0;
  let scoringVisits = 0;
  let scoring60 = 0;
  let lowVisits = 0;
  let bestVisit: number | null = null;
  const toFinish: number[] = [];
  const onFinishWon: number[] = [];
  let legsLostWithFinishChances = 0;
  let missedFinishVisitsInLostLegs = 0;
  let legsLostNeverOnFinish = 0;

  const legStory: LegStory[] = legs.map((leg, i) => {
    let dartsBefore = 0;
    let firstFinishIdx: number | null = null;
    let visitsOnFinish = 0;
    let checkout: number | null = null;

    leg.visits.forEach((v, idx) => {
      const before = remainingBefore(v);
      const finishable = canFinishFrom(before);
      if (finishable) {
        visitsOnFinish += 1;
        if (firstFinishIdx === null) firstFinishIdx = idx;
      } else if (firstFinishIdx === null) {
        dartsBefore += v.darts;
      }
      if (before > 170) {
        scoringVisits += 1;
        scoringDarts += v.darts;
        if (!v.isBust) {
          scoringPoints += v.score;
          if (v.score >= 60) scoring60 += 1;
          if (v.score < 40) lowVisits += 1;
        }
      }
      if (!v.isBust) bestVisit = bestVisit === null ? v.score : Math.max(bestVisit, v.score);
      if (v.isCheckout) checkout = v.score;
    });

    const won = leg.winner === "west";
    if (firstFinishIdx !== null) {
      toFinish.push(dartsBefore);
      if (won && checkout !== null) {
        const dartsOnFinish = leg.visits.slice(firstFinishIdx).reduce((s, v) => s + v.darts, 0);
        onFinishWon.push(dartsOnFinish);
      }
    }
    if (leg.winner === "opponent") {
      if (visitsOnFinish > 0) {
        legsLostWithFinishChances += 1;
        missedFinishVisitsInLostLegs += visitsOnFinish;
      } else {
        legsLostNeverOnFinish += 1;
      }
    }

    return {
      leg: i + 1,
      won,
      darts: leg.dartsTotal,
      threeDartAvg: round1(leg.threeDartAvg),
      dartsToReachFinish: firstFinishIdx === null ? null : dartsBefore,
      visitsOnFinish,
      checkout,
      busts: leg.busts
    };
  });

  return {
    scoringPhaseAvg: scoringDarts > 0 ? round1((scoringPoints / scoringDarts) * 3) : null,
    scoringPhase60PlusPct: scoringVisits > 0 ? Math.round((scoring60 / scoringVisits) * 100) : null,
    lowVisits,
    scoringPhaseVisits: scoringVisits,
    avgDartsToReachFinish: round1(mean(toFinish)),
    avgDartsOnFinishInLegsWon: round1(mean(onFinishWon)),
    legsLostWithFinishChances,
    missedFinishVisitsInLostLegs,
    legsLostNeverOnFinish,
    bestVisit,
    legStory
  };
}

export type SeasonBaseline = {
  legsPlayed: number;
  threeDartAvg: number | null;
  firstNineAvg: number | null;
  checkoutPct: number | null;
  checkoutAttempts: number;
  dartsPerLegWon: number | null;
  /** Mean leg average of the player's most recent legs before this match. */
  recentForm: number | null;
  /** Best single-leg average of the season before this match. */
  bestLegAvgBefore: number | null;
};

/**
 * The player's season yardstick. The card covers the season to date (this
 * match included); the leg log is used for form *before* this match so the
 * model can say whether tonight was up or down on how they've been throwing.
 */
export function buildSeasonBaseline(
  card: PlayerCard | undefined,
  log: PlayerGameStat[],
  excludeGameIds: Set<string>,
  recentLegs = 6
): SeasonBaseline | null {
  if (!card || card.legs_played === 0) return null;
  // log is most recent first, so everything after this match's oldest leg was
  // played before it. Reviews can be generated long after the match, so later
  // legs must not leak into "form before this match".
  let lastIdx = -1;
  log.forEach((g, i) => {
    if (excludeGameIds.has(g.game_id)) lastIdx = i;
  });
  const prior = log
    .slice(lastIdx + 1)
    .filter((g) => !excludeGameIds.has(g.game_id) && g.three_dart_avg !== null);
  const recent = prior.slice(0, recentLegs).map((g) => g.three_dart_avg as number);
  const best = prior.reduce<number | null>(
    (m, g) => (m === null ? (g.three_dart_avg as number) : Math.max(m, g.three_dart_avg as number)),
    null
  );
  return {
    legsPlayed: card.legs_played,
    threeDartAvg: round1(card.three_dart_avg),
    firstNineAvg: round1(card.first_nine_avg),
    checkoutPct: round1(card.checkout_pct),
    checkoutAttempts: card.checkout_attempts,
    dartsPerLegWon: round1(card.darts_per_leg_won),
    recentForm: recent.length >= 3 ? round1(mean(recent)) : null,
    bestLegAvgBefore: round1(best)
  };
}

export function compareToBaseline(
  tonight: { threeDartAvg: number | null; firstNineAvg: number | null; checkoutPct: number | null },
  base: SeasonBaseline | null
) {
  if (!base) return null;
  return {
    threeDartAvg: delta(tonight.threeDartAvg, base.threeDartAvg),
    firstNineAvg: delta(tonight.firstNineAvg, base.firstNineAvg),
    checkoutPct: delta(tonight.checkoutPct, base.checkoutPct),
    vsRecentForm: delta(tonight.threeDartAvg, base.recentForm)
  };
}

export type PlayerForm = {
  recentLegs: number;
  recentAvg: number | null;
  earlierAvg: number | null;
  change: number | null;
};

/** Recent legs vs the rest of the season, from a most-recent-first leg log. */
export function playerForm(log: PlayerGameStat[], recentLegs = 6): PlayerForm | null {
  const avgs = log.map((g) => g.three_dart_avg).filter((a): a is number => a !== null);
  if (avgs.length < recentLegs + 3) return null;
  const recent = mean(avgs.slice(0, recentLegs));
  const earlier = mean(avgs.slice(recentLegs));
  return { recentLegs, recentAvg: round1(recent), earlierAvg: round1(earlier), change: delta(recent, earlier) };
}

export { round1 };
