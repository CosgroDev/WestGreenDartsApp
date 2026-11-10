import type { LegSummary } from "@/data/matchSummary";
import type { PlayerCard, PlayerGameStat } from "@/data/stats";
import { canFinishFrom } from "@/lib/scoringUtils";

/**
 * Shared building blocks for the AI reviews (match, fixture night, season,
 * player): the prompts, and the derived numbers fed to the model.
 *
 * A review is only as good as what the model is shown. Raw aggregates give
 * it nothing the stat tiles don't already say, so the work here is deriving
 * what a player can't see from the scoresheet (how each leg was lost, what
 * the opponent threw, who reached a finish first, finishing with the
 * opponent on a double, this night against the player's own season) and
 * telling the model what each number means at pub-league level.
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

export const LEAGUE_FORMAT = `The format: West Green play in a pub league. A league night is a set of singles matches, each one West Green player against one opponent. A match is normally two legs of 501, double out, and the throw alternates, so each player gets one leg throwing first. Two legs won is a win, one each is a draw.`;

export const DARTS_BENCHMARKS = `How to read the numbers. Calibrate to a pub league, not the televised game:
- Three-dart average: under 35 is a hard night, 35-45 is a typical pub player, 45-55 is strong, 55-65 is county standard, 65+ is exceptional. A two-leg match is a small sample, so within about 3 of a player's own norm is noise and 6 or more is a real story.
- First nine against the overall average: a first nine well above the overall means scoring tails off once the finish comes into view (set-up visits, or tightening up). Well below means slow starts that hand the opponent a head start.
- Checkout % counts every visit that began on a finishable number, long shots such as 140 included, so 20-30% is normal here, 35%+ is good and 45%+ is clinical. With fewer than 4 attempts the percentage means nothing; talk about the actual chances.
- "doubleInHand" is the sharper finishing measure: visits that began on a one-dart finish (an even number up to 40, or 50) and how many were taken out. Roughly a third converted is ordinary at this level and a half or better is good. A weak checkout % with a healthy doubleInHand rate points at set-up and long finishes rather than at the doubles.
- How a leg was lost matters more than that it was lost. Lost with visits on a finish ("legsLostWithFinishChances", and "leftWhenLost" of 40 or less) is the painful, fixable kind. Lost without ever reaching a finish means the player was out-scored, and no amount of doubles practice fixes that.
- "firstFinishLeft" and "medianFirstFinishLeft" show set-up play: arriving on 32 or 40 is a leg managed well, repeatedly arriving on 120+ or an awkward odd number means the visit before the finish is costing darts.
- Throw order: the player throwing first should win the leg more often than not. Winning against the throw is a break and is worth more than holding; losing with the throw is the costlier loss.
- Busts nearly always point to route planning or counting, not to throwing.
- Scoring-phase visits under 40, and 26s (20-5-1), show grouping drifting off the treble. Mention 26s only when they are frequent (about one visit in eight or more); a single 26 is not a story.

The opponent's visits are recorded too, which is what lets you say why a leg went the way it did:
- "opposition" compares like with like over the legs where the opponent's visits exist. Winning while averaging less than the opponent means the leg was taken on the finish; losing while out-averaging them means it was given away there. Losing to someone who simply threw better is not a failing, and a good average against a strong opponent deserves more credit than the result shows.
- "firstToAFinish" and "secondToAFinish" give the leg record by who had a finishable number first. Losing legs after getting there first is a finishing problem; rarely getting there first is a scoring problem.
- "opponentLeft" on a finishing visit, and the split between finishing visits with the opponent also on a finish and not, show finishing under pressure. A clear gap between the two rates is worth telling the player; with only a handful of visits on either side it is not.
- "legsWonAfterOpponentMissedAFinish" are legs where the opponent had a visit at a finish and missed: a let-off, and worth being honest about when a scoreline flatters.
- "seasonOpposition", where given, is the average of every opponent West Green have faced this season: the yardstick for a hard or an easy game. "difficulty" rates a game against it ("hard" is an opponent at least 4 above it, "easy" at least 4 below, null when there is too little to judge). A result means more or less depending on it: a draw in a hard game can be a better night's work than a win in an easy one.
- The opponent was scored by whoever was marking, so treat their numbers as a fair guide rather than gospel. When an opponent block is null their visits were not recorded for those legs: say nothing about how they threw.

What is not recorded: the individual darts inside a visit, the segments hit, and which double was aimed at. You know what a visit scored and what was left, never how many darts went at a double or where a dart landed.`;

export const PRACTICE_OPTIONS = `Practice. Recommend a drill only when it attacks the specific weakness you identified, and set the target from the player's own current number so it is a stretch they can reach (someone converting 3 in 10 with a double in hand aims for 4 or 5, not 8). These games are in the team's app, so the player can start one from the same phone:
- 121 Challenge: checkouts climbing from 121 towards 170. Big finishes and planning a three-dart route.
- Random Checkout: a random finish from 2 to 170. Reading the board and choosing a route.
- Doubles Switch: a team doubles drill, in order and then at random. Raw double hitting.
- Practice 501: best of 1/3/5/7 legs from 301/501/701. Scoring volume, leg starts and whole-leg rhythm.
- Killer (pub game): hitting named numbers on demand. Accuracy away from the 20s.
Classic drills outside the app are fine when they fit better: Bob's 27 (doubles under pressure), round the clock on doubles, ten visits at treble 20 counting how many make 60+, or set-up practice (leaving 32 or 40 from 60-100).`;

export const WRITING_RULES = `How to write it:
- The page already shows the headline stats (average, first nine, checkouts, high finish) right next to your review, so repeating them adds nothing. What the reader cannot get from the numbers is the reading of them: why the legs went the way they did, and the one thing worth changing. An insight is a number plus what it meant for how the legs played out.
- Study the data first, then choose the two or three things that actually decided the outcome and leave the rest out. The most useful findings tend to sit where two numbers disagree: strong scoring with a poor result, a good average with a slow first nine, a decent checkout % with legs lost on a double.
- Every claim rests on a number in the data, and every number you quote is one you can point to there. If something would be interesting but the data does not show it, leave it out.
- Be honest and kind at once. A poor night is said plainly, without hollow praise. An excellent one is not given an invented weakness: the improvement point becomes how to sustain it or the next step up. When the opponent simply threw better, say that, rather than hunting for a fault.
- Praise specifically: name exactly what went well and why it mattered, so the player knows what to keep doing.
- Small samples get tentative language. Two legs, three finishing visits or one night against one opponent show what happened, not what a player is like.
- Where a player's own season baseline is given, measure against that first ("six up on your season average" says more than the raw number).
- Advice has to be something a pub player can act on at the next practice: one change, concretely described, rather than a list.
- Sound like a knowledgeable team-mate talking it over afterwards, not a report. Vary how you open, and do not start with the player's name or the score. Leave out stock filler such as "data in the bank", "keep the routine going", "proper highlight", "solid performance", "great effort" and "drifting off the 20 bed".
- The review is shown as plain text, so markdown, asterisks, hashes and bullet symbols would appear literally. Write plain sentences, with each labelled section on its own line.`;

export const MATCH_SYSTEM_PROMPT = `You are an experienced darts coach writing a short, personal review of one West Green Darts player's singles match. You are talking to the player directly, by name, and they will read it on their phone shortly after the match. They know the score; what they want is to understand why it went that way and what to do about it.

${LEAGUE_FORMAT}

The match arrives as JSON:
- "match": the result and the player's match-level stats.
- "derived": worked out from every visit. Scoring-phase average (visits that started above 170, so set-up shots don't drag it down), darts needed to reach a finish, doubleInHand, how each lost leg was lost, the leg record by throw order, and "opposition" (the opponent's numbers and the like-for-like comparison). "legStory" tells each leg: who threw first, the number left on first reaching a finish, every finishing visit ("finishChances": what was left, what was scored, the outcome and what the opponent had left at the time), what was left when the leg was lost, who reached a finish first, and the opponent's side of the leg.
- "seasonBaseline": the player's own season norm when there is one, with "vsSeason" giving this match minus that norm and "recentForm" the mean leg average of their last few legs before it.
- "legs": every visit in order. For the player, "score", "left" (remaining after the visit) and "opponentLeft" (what the opponent had left as the visit began). "opponentVisits" are the opponent's visits in the same leg.

${DARTS_BENCHMARKS}

${WRITING_RULES}
- Find the moment each leg turned: the visit where a lead was built or lost, the finishing visit that got away with the opponent sitting on a double, the leg won against the throw. One such moment, described with its numbers, is worth more than a summary of the whole match.

${PRACTICE_OPTIONS}

Format. Start with one or two unlabelled sentences on the story of the match: where it was won or lost. Then three labelled sections, each starting on a new line with its label exactly as written:
Keep doing: the one or two things that went well, with the numbers, and why they matter.
Work on: the single most important thing to improve, with the evidence. If nothing was weak, say what would take them up a level.
Practice: one drill with a specific target that addresses the "Work on" point.

Aim for about 200 words: it is read on a phone, in one go.`;

export const FIXTURE_SYSTEM_PROMPT = `You are the West Green Darts captain writing the team's review of a completed league night. The whole squad reads it on their phones, so it is one message to the team: it should explain where the night was won or lost and give the squad one thing to take to practice.

${LEAGUE_FORMAT}

The night arrives as JSON:
- "fixture": the team result and team-wide aggregates.
- "teamDerived": every visit of the night rolled up. How the lost legs were lost (with finish chances, or never reaching one), doubleInHand, the leg record with and against the throw, "opposition" (the opponents' combined numbers and the like-for-like comparison), and who played above or below their own season norm.
- "matches": one entry per West Green player in the order played, with their result and stats, a "derived" block, "legs" (each leg: who threw first, darts, average, the number left on first reaching a finish, what was left when a leg was lost, and the opponent's side), the opponent's average and, when available, "vsSeason" (this match minus that player's season norm).

${DARTS_BENCHMARKS}

${WRITING_RULES}
- Decide whether the night turned on scoring or on finishing, and say so with the evidence. The opposition comparison settles it: out-averaged across the night is a scoring story, level or ahead on averages with legs lost on a finish is a finishing story.
- Name players where it adds something: whoever won the key matches, whoever played well above their own norm, whoever beat a strong opponent, and, kindly, where a match slipped away. A performance well above someone's own norm deserves a mention even in a loss. Nobody is singled out harshly in front of the team.

${PRACTICE_OPTIONS}

Format. Start with one or two unlabelled sentences on how the night went and where it was decided. Then three labelled sections, each starting on a new line with its label exactly as written:
Keep doing: what the team did well as a unit, and the individual performances that stood out, with numbers.
Work on: the single biggest collective area to improve, with the evidence.
Practice: one or two drills for the squad this week, with specific targets.

Aim for about 260 words.`;

export const SEASON_SYSTEM_PROMPT = `You are the West Green Darts captain writing the season-to-date review for the squad. It sits at the top of the team dashboard and is rewritten after every league night, so it should tell the squad where the season stands, what is driving the results, and what would move them up.

${LEAGUE_FORMAT} A full night is six singles matches.

The season arrives as JSON:
- "season": the night-by-night results in date order and the overall record.
- "league": West Green's position and points with the teams around them in the table, when the league site could be read (otherwise null).
- "team": team-wide aggregates across every completed leg.
- "squadDerived": worked out from every visit of the season. "team" is the squad as a whole: scoring in legs won against legs lost, the leg record with and against the throw, second legs after winning or losing the first ("whenALegAhead", "whenALegBehind"), home against away, how legs are lost, finishing by the range the visit started from, "opposition" (the opponents' combined numbers and the like-for-like comparison) and the trend across the season. "nights" gives each night's average against the opposition's, and how that night's lost legs were lost.
- "players": per-player season stats with sample sizes ("legs", "checkoutAttempts"), a "form" block comparing their recent legs with their earlier ones, and a "profile" with how their legs are lost, doubleInHand, throw-order records and how they fare against what their opponents threw.
- "previousSummary": the review you wrote after the previous night (may be null). The squad has read it, so do not repeat its points. Say what has changed since, and if something it flagged has improved or got worse, call that out with the numbers.

${DARTS_BENCHMARKS}

${WRITING_RULES}
- Look for trends rather than snapshots: the run of results, the team average night by night against the opposition's, players whose form is rising or dipping, and whether legs are being lost on scoring or on finishing.
- Judge players on a handful of legs or checkout attempts cautiously, and say when a sample is thin.
- When the league table is given, tie the review to it: what the gap to the teams above or below means for the nights to come.

${PRACTICE_OPTIONS}

Format. Start with one or two unlabelled sentences on where the season stands and the direction it is heading. Then three labelled sections, each starting on a new line with its label exactly as written:
Keep doing: the team strengths and the players in form, with numbers.
Work on: the single biggest collective area holding the team back, with the evidence.
Practice: one or two drills for the squad, with specific targets.

Aim for about 280 words.`;

export const PLAYER_SYSTEM_PROMPT = `You are an experienced darts coach who has studied every visit one West Green Darts player has thrown this season, and every visit thrown against them, writing them a personal season profile. You are talking to the player directly, by name. This is the deepest read of their game they get all season, so it should tell them things they could not see from the scoresheet.

${LEAGUE_FORMAT}

The season arrives as JSON:
- "player": name and headline season stats with sample sizes.
- "derived": worked out from every visit.
  - "record" and "matchTimeline": every match in date order with legs, the player's average and the opponent's, first nine, checkouts (hits/attempts) and best leg.
  - "wonVsLostLegs": scoring in legs won against legs lost. A big gap means results hinge on scoring; a small gap means legs are decided on the finish.
  - "throwOrder": leg record and average throwing first and second.
  - "pressure": opening legs, second legs after losing the first ("whenALegBehind") or winning it ("whenALegAhead"), and comeback wins. "deciders" only has legs in matches longer than two legs.
  - "venue": home against away.
  - "consistency": spread of leg averages (a standard deviation above about 9 is streaky, under about 5 is very steady), best and worst legs.
  - "scoring": per-visit rates, scoring-phase average (visits started above 170), darts needed to reach a finish, low visits, legs lost with finish chances against legs lost without ever reaching one.
  - "finishing": success by the range the visit started from, doubleInHand, busts, one-dart finishes, favourite checkouts, "medianFirstFinishLeft" (the number typically left on first reaching a finish), "medianLeftWhenLost" and "legsLostOnADouble" (legs lost needing 40 or fewer).
  - "opposition": the opponents' combined average beside the player's over the same legs, the leg record when out-scoring the opponent and when out-scored, the record when first and second to a finish, finishing with and without the opponent also on a finish, and legs won after the opponent missed a finish.
  - "speed": darts per leg won.
  - "trend": first half of the season against the second, and the last three matches against everything before.
- "squad": rank (1 is best) against the rest of the squad and the squad figure for each headline metric, the leaderboard performance rating and the player's flair "aura".
- "practice": what the player has logged in the app's practice games, all time rather than this season. A block is null when they have never played that game. Practice numbers are not match numbers: a clear gap between a practice figure and the matching match figure (doubles hit in Doubles Switch against doubleInHand in matches, a practice 501 average against the match average) is itself a finding about pressure. Build the practice plan on what they already do, and if they have logged little or nothing, the plan can start there.
- "previousInsight": what you told them last time (may be null). They have read it, so do not repeat it. Say what has changed since, and if something it flagged has moved, call that out with the numbers.

${DARTS_BENCHMARKS}

${WRITING_RULES}
- Hunt for what is not obvious: a gap between throwing first and second, a second leg that goes missing after losing the first, a finishing range that leaks, legs lost after being first to a finish, a home and away split, a first nine that fades, a streak in the timeline, a practice figure that does not show up in matches. Lead with whatever is most striking and most useful.
- A split is only a pattern when both sides have enough behind them: roughly 5 or more legs each, or 8 or more finishing visits in a range. Below that, leave it out or call it early.
- Use the squad context to give numbers meaning ("second-best first nine in the squad"), but this is about the player, not a ranking table.
- With only a few matches played, say it is early and keep the conclusions tentative.

${PRACTICE_OPTIONS}

Format. Start with two or three unlabelled sentences that capture who this player is as a darter this season and the direction they are heading. Then four labelled sections, each starting on a new line with its label exactly as written:
Strengths: the two or three things that win them legs, with numbers.
Holding you back: the single biggest thing costing them legs, with the evidence and what it means in practice.
Hidden pattern: one thing from the splits, ranges, opposition or timeline they probably have not noticed, and why it matters. If nothing meaningful stands out, use this for the trend instead.
Practice plan: one or two drills with specific targets that attack the "Holding you back" point.

Aim for about 350 words.`;

// ---------------------------------------------------------------------------
// Derived stats
// ---------------------------------------------------------------------------

export type Tally = { legs: number; won: number };

/** One visit that began on a finishable number, and what came of it. */
export type FinishChance = {
  left: number;
  scored: number;
  outcome: "checkout" | "missed" | "bust";
  /** What the opponent had left at the time (absent if their visits weren't recorded). */
  opponentLeft?: number;
};

export type LegStory = {
  leg: number;
  won: boolean;
  /** True when the West Green player threw first (null if unknown). */
  threwFirst: boolean | null;
  darts: number;
  threeDartAvg: number | null;
  /** Darts thrown before the first visit that started on a finishable number. */
  dartsToReachFinish: number | null;
  /** The number left on first reaching a finish — the quality of the set-up. */
  firstFinishLeft: number | null;
  /** Visits that started on a finishable number. */
  visitsOnFinish: number;
  finishChances: FinishChance[];
  checkout: number | null;
  busts: number;
  /** What the player still needed when the opponent won the leg. */
  leftWhenLost: number | null;
  /** Who had a finishable number first (null if neither did, or the opponent's visits weren't recorded). */
  firstToAFinish: "player" | "opponent" | null;
  /** The opponent's side of the leg; null when their visits weren't recorded. */
  opponent: {
    darts: number;
    threeDartAvg: number | null;
    /** What the opponent had left when the leg ended (0 when they won it). */
    left: number;
    /** Opponent visits that began on a finish and didn't take it out. */
    missedFinishVisits: number;
    /** Player's points minus the opponent's over the first three visits each. */
    firstNineLead: number | null;
  } | null;
};

export type Opposition = {
  legsWithOpponentVisits: number;
  opponentThreeDartAvg: number | null;
  /** The player's average over the same legs, for a like-for-like comparison. */
  playerThreeDartAvg: number | null;
  opponentFirstNineAvg: number | null;
  opponentCheckout: { hits: number; attempts: number };
  opponentHighFinish: number | null;
  opponentHundredPlus: number;
  /** Legs where the player's leg average beat the opponent's, and how many of those were won. */
  outscoredOpponent: Tally;
  outscoredByOpponent: Tally;
  firstToAFinish: Tally;
  secondToAFinish: Tally;
  /** The player's finishing visits split by whether the opponent was also on a finish at the time. */
  finishVisitsWithOpponentOnAFinish: { visits: number; hits: number };
  finishVisitsWithOpponentNotOnAFinish: { visits: number; hits: number };
  /** Legs won after the opponent had at least one visit at a finish and missed. */
  legsWonAfterOpponentMissedAFinish: number;
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
  /** Visits that began on a one-dart finish (an even number up to 40, or 50) and how many were taken out. */
  doubleInHand: { visits: number; hits: number };
  /** What the player still needed in the legs they lost. */
  medianLeftWhenLost: number | null;
  /** Legs lost with 40 or fewer left — one dart from winning. */
  legsLostOnADouble: number;
  /** Leg record with the throw and against it; null when the order is unknown. */
  throwOrder: { throwingFirst: Tally; throwingSecond: Tally } | null;
  /** The opponents' side; null when none of their visits were recorded. */
  opposition: Opposition | null;
  bestVisit: number | null;
  legStory: LegStory[];
};

const remainingBefore = (v: LegSummary["visits"][number]) =>
  v.isBust ? v.remainingAfter : v.remainingAfter + v.score;

const oneDartFinish = (left: number) => left === 50 || (left >= 2 && left <= 40 && left % 2 === 0);

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const sidePoints = (visits: LegSummary["visits"]) => visits.reduce((s, v) => s + (v.isBust ? 0 : v.score), 0);
const sideDarts = (visits: LegSummary["visits"]) => visits.reduce((s, v) => s + v.darts, 0);
const sideAvg = (visits: LegSummary["visits"]) => {
  const darts = sideDarts(visits);
  return darts > 0 ? (sidePoints(visits) / darts) * 3 : null;
};

/** Throw-order position at which a side first had a finishable number left. */
const reachedFinishAt = (visits: LegSummary["visits"]) => {
  const v = visits.find((x) => !x.isCheckout && canFinishFrom(x.remainingAfter));
  return v?.seq ?? null;
};

const tally = (): Tally => ({ legs: 0, won: 0 });
const count = (t: Tally, won: boolean) => {
  t.legs += 1;
  if (won) t.won += 1;
};

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
  const doubleInHand = { visits: 0, hits: 0 };
  const leftWhenLost: number[] = [];
  const throwingFirst = tally();
  const throwingSecond = tally();

  // The opponents' side, over the legs where their visits were recorded.
  const oppVisits: LegSummary["visits"] = [];
  const westVisitsVsOpp: LegSummary["visits"] = [];
  const oppFirstNines: number[] = [];
  const outscoredOpponent = tally();
  const outscoredByOpponent = tally();
  const firstToAFinish = tally();
  const secondToAFinish = tally();
  const underPressure = { visits: 0, hits: 0 };
  const noPressure = { visits: 0, hits: 0 };
  let legsWithOpponentVisits = 0;
  let legsWonAfterOpponentMissedAFinish = 0;

  const legStory: LegStory[] = legs.map((leg, i) => {
    let dartsBefore = 0;
    let firstFinishIdx: number | null = null;
    let firstFinishLeft: number | null = null;
    let checkout: number | null = null;
    const finishChances: FinishChance[] = [];
    const opp = leg.opponentVisits ?? [];
    const hasOpp = opp.length > 0;

    leg.visits.forEach((v, idx) => {
      const before = remainingBefore(v);
      const finishable = canFinishFrom(before);
      if (finishable) {
        if (firstFinishIdx === null) {
          firstFinishIdx = idx;
          firstFinishLeft = before;
        }
        finishChances.push({
          left: before,
          scored: v.isBust ? 0 : v.score,
          outcome: v.isCheckout ? "checkout" : v.isBust ? "bust" : "missed",
          ...(hasOpp && v.otherLeft !== undefined ? { opponentLeft: v.otherLeft } : {})
        });
        if (oneDartFinish(before)) {
          doubleInHand.visits += 1;
          if (v.isCheckout) doubleInHand.hits += 1;
        }
        if (hasOpp && v.otherLeft !== undefined) {
          const bucket = canFinishFrom(v.otherLeft) ? underPressure : noPressure;
          bucket.visits += 1;
          if (v.isCheckout) bucket.hits += 1;
        }
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
    const lost = leg.winner === "opponent";
    const visitsOnFinish = finishChances.length;
    if (firstFinishIdx !== null) {
      toFinish.push(dartsBefore);
      if (won && checkout !== null) {
        const dartsOnFinish = leg.visits.slice(firstFinishIdx).reduce((s, v) => s + v.darts, 0);
        onFinishWon.push(dartsOnFinish);
      }
    }
    const left = leg.visits.length ? leg.visits[leg.visits.length - 1].remainingAfter : 501;
    if (lost) {
      leftWhenLost.push(left);
      if (visitsOnFinish > 0) {
        legsLostWithFinishChances += 1;
        missedFinishVisitsInLostLegs += visitsOnFinish;
      } else {
        legsLostNeverOnFinish += 1;
      }
    }

    const threwFirst = leg.westStarted ?? null;
    if (threwFirst !== null && (won || lost)) count(threwFirst ? throwingFirst : throwingSecond, won);

    let whoFirst: LegStory["firstToAFinish"] = null;
    let opponent: LegStory["opponent"] = null;
    if (hasOpp) {
      legsWithOpponentVisits += 1;
      oppVisits.push(...opp);
      westVisitsVsOpp.push(...leg.visits);
      const oppAvg = sideAvg(opp);
      const westAvg = sideAvg(leg.visits);
      if (opp.length >= 3 && sideDarts(opp.slice(0, 3)) === 9) oppFirstNines.push(sidePoints(opp.slice(0, 3)) / 3);
      if (oppAvg !== null && westAvg !== null && westAvg !== oppAvg && (won || lost)) {
        count(westAvg > oppAvg ? outscoredOpponent : outscoredByOpponent, won);
      }
      const westAt = reachedFinishAt(leg.visits);
      const oppAt = reachedFinishAt(opp);
      if (westAt !== null || oppAt !== null) {
        whoFirst = oppAt === null || (westAt !== null && westAt < oppAt) ? "player" : "opponent";
        if (won || lost) count(whoFirst === "player" ? firstToAFinish : secondToAFinish, won);
      }
      const missedFinishVisits = opp.filter((v) => !v.isCheckout && canFinishFrom(remainingBefore(v))).length;
      if (won && missedFinishVisits > 0) legsWonAfterOpponentMissedAFinish += 1;
      opponent = {
        darts: sideDarts(opp),
        threeDartAvg: round1(oppAvg),
        left: opp[opp.length - 1].remainingAfter,
        missedFinishVisits,
        firstNineLead:
          opp.length >= 3 && leg.visits.length >= 3
            ? sidePoints(leg.visits.slice(0, 3)) - sidePoints(opp.slice(0, 3))
            : null
      };
    }

    return {
      leg: i + 1,
      won,
      threwFirst,
      darts: leg.dartsTotal,
      threeDartAvg: round1(leg.threeDartAvg),
      dartsToReachFinish: firstFinishIdx === null ? null : dartsBefore,
      firstFinishLeft,
      visitsOnFinish,
      finishChances,
      checkout,
      busts: leg.busts,
      leftWhenLost: lost ? left : null,
      firstToAFinish: whoFirst,
      opponent
    };
  });

  const oppHigh = oppVisits.filter((v) => v.isCheckout).map((v) => v.score);
  const oppAttempts = oppVisits.filter((v) => canFinishFrom(remainingBefore(v)));

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
    doubleInHand,
    medianLeftWhenLost: median(leftWhenLost),
    legsLostOnADouble: leftWhenLost.filter((n) => n <= 40).length,
    throwOrder: throwingFirst.legs + throwingSecond.legs > 0 ? { throwingFirst, throwingSecond } : null,
    opposition: legsWithOpponentVisits
      ? {
          legsWithOpponentVisits,
          opponentThreeDartAvg: round1(sideAvg(oppVisits)),
          playerThreeDartAvg: round1(sideAvg(westVisitsVsOpp)),
          opponentFirstNineAvg: round1(mean(oppFirstNines)),
          opponentCheckout: { hits: oppHigh.length, attempts: oppAttempts.length },
          opponentHighFinish: oppHigh.length ? Math.max(...oppHigh) : null,
          opponentHundredPlus: oppVisits.filter((v) => !v.isBust && v.score >= 100).length,
          outscoredOpponent,
          outscoredByOpponent,
          firstToAFinish,
          secondToAFinish,
          finishVisitsWithOpponentOnAFinish: underPressure,
          finishVisitsWithOpponentNotOnAFinish: noPressure,
          legsWonAfterOpponentMissedAFinish
        }
      : null,
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
