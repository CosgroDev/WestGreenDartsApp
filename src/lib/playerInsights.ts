import type { CheckoutPlayerStat } from "@/data/checkoutPractice";
import type { DoublesPlayerStat } from "@/data/doublesPractice";
import type { Game121PlayerStat } from "@/data/game121";
import type { LegSummary } from "@/data/matchSummary";
import type { PracticePlayerStat } from "@/data/practice";
import type { PlayerCard } from "@/data/stats";
import { buildPerformanceLeaderboard } from "@/lib/playerPerformance";
import { buildPlayerAuras } from "@/lib/playerAura";
import { canFinishFrom } from "@/lib/scoringUtils";
import { deriveMatch, round1 } from "@/lib/aiCoaching";

/**
 * Season-long derived read of one player, for the AI player insight.
 *
 * The card stats on the leaderboard say *what* a player averages; they can't
 * say *why* legs are won or lost. Everything here is worked out from every
 * visit of the season so the model can find the patterns a player can't see
 * from the scoresheet: where finishing breaks down by range, whether throwing
 * first matters, how they handle deciders, how consistent they are, how they
 * fare against what the opponent actually threw, and where they sit in the
 * squad.
 */

export type InsightLeg = LegSummary & {
  /** True when the West Green player threw first in the leg (null if unknown). */
  westStarted: boolean | null;
};

export type InsightMatch = {
  date: string;
  opponentTeam: string;
  opponentPlayer: string;
  home: boolean;
  /** Legs in the order they were played. */
  legs: InsightLeg[];
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

const stdDev = (xs: number[]) => {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
};

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);

const record = (legs: InsightLeg[]) => {
  const won = legs.filter((l) => l.winner === "west").length;
  return { legs: legs.length, won, winPct: pct(won, legs.length) };
};

/** Combined three-dart average over a set of legs (points / darts, not a mean of means). */
const legsAvg = (legs: LegSummary[]) => {
  const darts = legs.reduce((s, l) => s + l.dartsTotal, 0);
  const points = legs.reduce((s, l) => s + l.pointsTotal, 0);
  return darts > 0 ? round1((points / darts) * 3) : null;
};

/** The opponents' combined average over the legs where their visits were recorded. */
const opponentAvg = (legs: LegSummary[]) => {
  const visits = legs.flatMap((l) => l.opponentVisits ?? []);
  const darts = visits.reduce((s, v) => s + v.darts, 0);
  const points = visits.reduce((s, v) => s + (v.isBust ? 0 : v.score), 0);
  return darts > 0 ? round1((points / darts) * 3) : null;
};

const legsFirstNine = (legs: LegSummary[]) =>
  round1(mean(legs.map((l) => l.firstNineAvg).filter((a): a is number => a !== null)));

// Finishing ranges that ask different questions of a player: a double or a
// simple two-darter, a set-up-and-double, a proper three-dart route, and the
// big fish.
const FINISH_RANGES = [
  { label: "2-40", min: 2, max: 40 },
  { label: "41-60", min: 41, max: 60 },
  { label: "61-100", min: 61, max: 100 },
  { label: "101-130", min: 101, max: 130 },
  { label: "131-170", min: 131, max: 170 }
];

const remainingBefore = (v: LegSummary["visits"][number]) => (v.isBust ? v.remainingAfter : v.remainingAfter + v.score);

function matchResult(legs: InsightLeg[]) {
  const won = legs.filter((l) => l.winner === "west").length;
  const lost = legs.filter((l) => l.winner === "opponent").length;
  return { won, lost, result: won > lost ? ("win" as const) : lost > won ? ("loss" as const) : ("draw" as const) };
}

export function derivePlayerSeason(matches: InsightMatch[]) {
  const ordered = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const legs = ordered.flatMap((m) => m.legs);
  const won = legs.filter((l) => l.winner === "west");
  const lost = legs.filter((l) => l.winner === "opponent");
  const results = ordered.map((m) => matchResult(m.legs));

  // Leg context: opening legs, deciders (the final leg of a match that was
  // level going into it) and legs after going a leg down.
  const openingLegs: InsightLeg[] = [];
  const deciders: InsightLeg[] = [];
  const whenBehind: InsightLeg[] = [];
  const whenAhead: InsightLeg[] = [];
  let comebacks = 0;
  let lostFirstLeg = 0;
  ordered.forEach((m, mi) => {
    let w = 0;
    let o = 0;
    m.legs.forEach((l, i) => {
      if (i === 0) openingLegs.push(l);
      if (i > 0 && i === m.legs.length - 1 && w === o) deciders.push(l);
      if (w < o) whenBehind.push(l);
      if (w > o) whenAhead.push(l);
      if (l.winner === "west") w += 1;
      else if (l.winner === "opponent") o += 1;
    });
    if (m.legs[0]?.winner === "opponent") {
      lostFirstLeg += 1;
      if (results[mi].result === "win") comebacks += 1;
    }
  });

  // Finishing by range: every visit that began on a finishable number is a
  // chance; a checkout from it is a hit.
  const ranges = FINISH_RANGES.map((r) => ({ ...r, visits: 0, hits: 0, busts: 0 }));
  const checkouts = new Map<number, number>();
  const firstFinishLeft: number[] = [];
  let finishVisits = 0;
  let finishHits = 0;
  let busts = 0;
  let oneDartFinishes = 0;
  legs.forEach((l) => {
    let reachedFinish = false;
    l.visits.forEach((v) => {
      const before = remainingBefore(v);
      if (v.isBust) busts += 1;
      if (!canFinishFrom(before)) return;
      if (!reachedFinish) {
        reachedFinish = true;
        firstFinishLeft.push(before);
      }
      finishVisits += 1;
      const range = ranges.find((r) => before >= r.min && before <= r.max);
      if (range) {
        range.visits += 1;
        if (v.isCheckout) range.hits += 1;
        if (v.isBust) range.busts += 1;
      }
      if (v.isCheckout) {
        finishHits += 1;
        checkouts.set(v.score, (checkouts.get(v.score) ?? 0) + 1);
        if (v.darts === 1) oneDartFinishes += 1;
      }
    });
  });

  // Scoring rates per visit across the whole season.
  const visits = legs.reduce((s, l) => s + l.visits.length, 0);
  const bands = legs.reduce(
    (acc, l) => {
      (Object.keys(acc) as (keyof typeof acc)[]).forEach((k) => (acc[k] += l.bands[k]));
      return acc;
    },
    { sixtyPlus: 0, eightyPlus: 0, hundredPlus: 0, oneFortyPlus: 0, oneEighty: 0, twentySix: 0 }
  );

  const legAvgs = legs.map((l) => l.threeDartAvg).filter((a): a is number => a !== null);
  const wonDarts = won.map((l) => l.dartsTotal).filter((d) => d > 0);
  const {
    legStory: _legStory,
    throwOrder: _throwOrder,
    doubleInHand,
    medianLeftWhenLost,
    legsLostOnADouble,
    opposition,
    ...derived
  } = deriveMatch(legs);

  // Trend: first half of the season vs the second, and the last three matches.
  const half = Math.floor(ordered.length / 2);
  const earlyLegs = ordered.slice(0, half).flatMap((m) => m.legs);
  const lateLegs = ordered.slice(half).flatMap((m) => m.legs);
  const lastThree = ordered.slice(-3).flatMap((m) => m.legs);
  const beforeLastThree = ordered.slice(0, -3).flatMap((m) => m.legs);

  const split = (filter: (m: InsightMatch) => boolean) => {
    const ls = ordered.filter(filter).flatMap((m) => m.legs);
    return { ...record(ls), threeDartAvg: legsAvg(ls) };
  };

  const throwFirst = legs.filter((l) => l.westStarted === true);
  const throwSecond = legs.filter((l) => l.westStarted === false);

  return {
    record: {
      matches: ordered.length,
      matchWins: results.filter((r) => r.result === "win").length,
      matchDraws: results.filter((r) => r.result === "draw").length,
      matchLosses: results.filter((r) => r.result === "loss").length,
      legsWon: won.length,
      legsLost: lost.length
    },
    matchTimeline: ordered.map((m, i) => {
      const finishing = m.legs.reduce(
        (acc, l) => ({ hits: acc.hits + l.checkoutHits, attempts: acc.attempts + l.checkoutAttempts }),
        { hits: 0, attempts: 0 }
      );
      const best = m.legs
        .filter((l) => l.winner === "west" && l.dartsTotal > 0)
        .reduce<number | null>((min, l) => (min === null ? l.dartsTotal : Math.min(min, l.dartsTotal)), null);
      const high = m.legs.reduce<number | null>(
        (max, l) => (l.highFinish === null ? max : max === null ? l.highFinish : Math.max(max, l.highFinish)),
        null
      );
      return {
        date: m.date.slice(0, 10),
        opponent: `${m.opponentPlayer} (${m.opponentTeam})`,
        venue: m.home ? "home" : "away",
        result: results[i].result,
        legs: `${results[i].won}-${results[i].lost}`,
        threeDartAvg: legsAvg(m.legs),
        opponentThreeDartAvg: opponentAvg(m.legs),
        firstNineAvg: legsFirstNine(m.legs),
        checkout: `${finishing.hits}/${finishing.attempts}`,
        highFinish: high,
        bestLegDarts: best
      };
    }),
    wonVsLostLegs: {
      won: { legs: won.length, threeDartAvg: legsAvg(won), firstNineAvg: legsFirstNine(won) },
      lost: { legs: lost.length, threeDartAvg: legsAvg(lost), firstNineAvg: legsFirstNine(lost) }
    },
    throwOrder:
      throwFirst.length + throwSecond.length > 0
        ? {
            throwingFirst: { ...record(throwFirst), threeDartAvg: legsAvg(throwFirst) },
            throwingSecond: { ...record(throwSecond), threeDartAvg: legsAvg(throwSecond) }
          }
        : null,
    pressure: {
      openingLegs: record(openingLegs),
      deciders: { ...record(deciders), threeDartAvg: legsAvg(deciders) },
      whenALegBehind: record(whenBehind),
      whenALegAhead: record(whenAhead),
      matchesAfterLosingFirstLeg: lostFirstLeg,
      comebackWins: comebacks
    },
    venue: { home: split((m) => m.home), away: split((m) => !m.home) },
    consistency: {
      legAvgStdDev: round1(stdDev(legAvgs)),
      bestLegAvg: round1(legAvgs.length ? Math.max(...legAvgs) : null),
      worstLegAvg: round1(legAvgs.length ? Math.min(...legAvgs) : null),
      legsAvg50Plus: legAvgs.filter((a) => a >= 50).length,
      legsAvgUnder35: legAvgs.filter((a) => a < 35).length
    },
    scoring: {
      seasonAvg: legsAvg(legs),
      firstNineAvg: legsFirstNine(legs),
      visits,
      sixtyPlusPct: pct(bands.sixtyPlus, visits),
      hundredPlusPct: pct(bands.hundredPlus, visits),
      oneFortyPlus: bands.oneFortyPlus,
      oneEighties: bands.oneEighty,
      twentySixes: bands.twentySix,
      ...derived
    },
    finishing: {
      visitsOnAFinish: finishVisits,
      checkouts: finishHits,
      checkoutPct: pct(finishHits, finishVisits),
      busts,
      oneDartFinishes,
      byRange: ranges.map(({ label, visits: v, hits, busts: b }) => ({
        range: label,
        visits: v,
        hits,
        pct: pct(hits, v),
        busts: b
      })),
      /** Visits that began on a one-dart finish: the truest read of double hitting. */
      doubleInHand: { ...doubleInHand, pct: pct(doubleInHand.hits, doubleInHand.visits) },
      /** The number left on the first visit a leg became finishable — set-up quality. */
      medianFirstFinishLeft: median(firstFinishLeft),
      /** What was still needed in the legs that got away. */
      medianLeftWhenLost,
      legsLostOnADouble,
      favouriteCheckouts: [...checkouts.entries()]
        .sort((a, b) => b[1] - a[1] || b[0] - a[0])
        .slice(0, 5)
        .map(([finish, times]) => ({ finish, times })),
      highestCheckout: checkouts.size ? Math.max(...checkouts.keys()) : null
    },
    /** Measured against what the opponents actually threw; null if their visits weren't recorded. */
    opposition,
    speed: {
      fastestLegDarts: wonDarts.length ? Math.min(...wonDarts) : null,
      medianDartsPerLegWon: median(wonDarts),
      legsWonIn18OrFewer: wonDarts.filter((d) => d <= 18).length,
      legsWonIn24OrMore: wonDarts.filter((d) => d >= 24).length
    },
    trend:
      ordered.length >= 4
        ? {
            firstHalf: { ...record(earlyLegs), threeDartAvg: legsAvg(earlyLegs) },
            secondHalf: { ...record(lateLegs), threeDartAvg: legsAvg(lateLegs) },
            lastThreeMatches: { ...record(lastThree), threeDartAvg: legsAvg(lastThree) },
            beforeThat: { ...record(beforeLastThree), threeDartAvg: legsAvg(beforeLastThree) }
          }
        : null
  };
}

export type PlayerSeasonDerived = ReturnType<typeof derivePlayerSeason>;

/**
 * The squad's season from every visit, for the AI season review: one
 * team-wide profile (how legs are won and lost, by throw order, venue and
 * against what opponents threw), a night-by-night timeline, and a short
 * diagnostic line per player.
 */
export function deriveSquadSeason(squad: { playerId: string; matches: InsightMatch[] }[]) {
  const all = squad.flatMap((p) => p.matches);
  const { matchTimeline: _timeline, record: _record, consistency: _consistency, ...team } = derivePlayerSeason(all);

  const nights = new Map<string, InsightMatch[]>();
  all.forEach((m) => {
    const key = `${m.date.slice(0, 10)}|${m.opponentTeam}`;
    nights.set(key, [...(nights.get(key) ?? []), m]);
  });

  return {
    team,
    nights: [...nights.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, matches]) => {
        const legs = matches.flatMap((m) => m.legs);
        const d = deriveMatch(legs);
        return {
          date: matches[0].date.slice(0, 10),
          opponent: matches[0].opponentTeam,
          venue: matches[0].home ? "home" : "away",
          legs: `${legs.filter((l) => l.winner === "west").length}-${legs.filter((l) => l.winner === "opponent").length}`,
          threeDartAvg: legsAvg(legs),
          opponentThreeDartAvg: opponentAvg(legs),
          checkout: `${legs.reduce((s, l) => s + l.checkoutHits, 0)}/${legs.reduce((s, l) => s + l.checkoutAttempts, 0)}`,
          legsLostWithFinishChances: d.legsLostWithFinishChances,
          legsLostNeverOnFinish: d.legsLostNeverOnFinish
        };
      }),
    players: squad
      .filter((p) => p.matches.length > 0)
      .map((p) => {
        const d = derivePlayerSeason(p.matches);
        return {
          playerId: p.playerId,
          legsLostWithFinishChances: d.scoring.legsLostWithFinishChances,
          legsLostNeverOnFinish: d.scoring.legsLostNeverOnFinish,
          avgDartsToReachFinish: d.scoring.avgDartsToReachFinish,
          doubleInHand: d.finishing.doubleInHand,
          medianFirstFinishLeft: d.finishing.medianFirstFinishLeft,
          throwingFirst: d.throwOrder?.throwingFirst ?? null,
          throwingSecond: d.throwOrder?.throwingSecond ?? null,
          opponentThreeDartAvg: d.opposition?.opponentThreeDartAvg ?? null,
          outscoredOpponent: d.opposition?.outscoredOpponent ?? null,
          outscoredByOpponent: d.opposition?.outscoredByOpponent ?? null,
          legAvgStdDev: d.consistency.legAvgStdDev
        };
      })
  };
}

export type PracticeSources = {
  legs: PracticePlayerStat[];
  checkout: CheckoutPlayerStat[];
  doubles: DoublesPlayerStat[];
  game121: Game121PlayerStat[];
};

/**
 * What the player has logged in the app's practice games (all time, not just
 * this season). It lets the insight compare practice with match play and
 * build on drills the player already does rather than suggesting them cold.
 * Each block is null when the player has logged nothing in that game.
 */
export function practiceContext(playerId: string, sources: PracticeSources) {
  const legs = sources.legs.find((p) => p.player_id === playerId);
  const checkout = sources.checkout.find((p) => p.player_id === playerId);
  const doubles = sources.doubles.find((p) => p.player_id === playerId);
  const game121 = sources.game121.find((p) => p.player_id === playerId);
  return {
    practice501: legs
      ? {
          legs: legs.legs_played,
          legsWon: legs.legs_won,
          threeDartAvg: round1(legs.three_dart_avg),
          firstNineAvg: round1(legs.first_nine_avg),
          highFinish: legs.high_finish
        }
      : null,
    randomCheckout: checkout
      ? {
          attempts: checkout.attempts,
          checkouts: checkout.checkouts,
          checkoutPct: round1(checkout.checkout_pct),
          avgDartsWhenSuccessful: round1(checkout.avg_darts)
        }
      : null,
    doublesSwitch: doubles
      ? {
          games: doubles.games_played,
          visitsAtADouble: doubles.total_attempts,
          hitPct: round1(doubles.double_pct),
          firstDartHitPct: round1(doubles.first_dart_pct),
          weakestDoubles: doubles.weakest_doubles
        }
      : null,
    challenge121: game121
      ? {
          games: game121.games_played,
          gamesWon: game121.games_won,
          bestCheckout: game121.best_checkout,
          finishedAtFirstAttemptPct: round1(game121.lock_rate)
        }
      : null
  };
}

/**
 * Where the player sits in the squad: rank (1 = best) and the squad's
 * combined figure for each headline metric, plus the leaderboard's
 * performance rating and flair aura. Only players with legs count.
 */
export function squadContext(playerId: string, cards: PlayerCard[]) {
  const field = cards.filter((c) => c.legs_played > 0);
  const me = field.find((c) => c.player_id === playerId);
  if (!me) return null;

  const metric = (
    value: (c: PlayerCard) => number | null,
    higherIsBetter = true,
    teamValue: number | null = null
  ) => {
    const mine = value(me);
    const values = field.map(value).filter((v): v is number => v !== null);
    const rank = mine === null ? null : values.filter((v) => (higherIsBetter ? v > mine : v < mine)).length + 1;
    return { value: round1(mine), rank, of: values.length, squad: round1(teamValue ?? mean(values)) };
  };

  const sum = (f: (c: PlayerCard) => number) => field.reduce((s, c) => s + f(c), 0);
  const legsPlayed = sum((c) => c.legs_played);
  const visits = sum((c) => c.scoring_visits);
  const attempts = sum((c) => c.checkout_attempts);

  const rating = buildPerformanceLeaderboard(cards).ratings.find((r) => r.playerId === playerId);
  const aura = buildPlayerAuras(cards).get(playerId);

  return {
    squadSize: field.length,
    legWinPct: metric(
      (c) => (c.legs_played ? (c.legs_won / c.legs_played) * 100 : null),
      true,
      legsPlayed ? (sum((c) => c.legs_won) / legsPlayed) * 100 : null
    ),
    threeDartAvg: metric((c) => c.three_dart_avg),
    firstNineAvg: metric((c) => c.first_nine_avg),
    checkoutPct: metric(
      (c) => c.checkout_pct,
      true,
      attempts ? (sum((c) => c.checkout_hits) / attempts) * 100 : null
    ),
    dartsPerLegWon: metric((c) => c.darts_per_leg_won, false),
    hundredPlusPct: metric(
      (c) => (c.scoring_visits ? (c.hundred_plus / c.scoring_visits) * 100 : null),
      true,
      visits ? (sum((c) => c.hundred_plus) / visits) * 100 : null
    ),
    performanceRating: rating
      ? { score: round1(rating.score), rank: rating.rank, qualified: rating.qualified }
      : null,
    aura: aura?.tier ? { tier: aura.tier.name, trait: aura.trait, provisional: aura.provisional } : null
  };
}
