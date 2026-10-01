import { calculateLeagueStandings, getLiveLeagueData, TARGET_TEAM, TARGET_LEAGUE, type LeagueStanding } from "./liveLeague";

export type InsightResult = {
  id: string; week: number | null; homeId: string; awayId: string;
  home: string; away: string; homeScore: number; awayScore: number;
};
type Model = { strengths: Record<string, number>; home: number };
const clamp = (n: number) => Math.max(0.05, Math.min(0.95, n));

// Ridge least squares on leg share. Five neutral fixture equivalents per
// coefficient reduce extreme estimates from small samples. No match-win odds.
export function fitStrengths(teamIds: string[], results: InsightResult[]): Model {
  const size = teamIds.length + 1;
  const indices = new Map(teamIds.map((id, i) => [id, i]));
  const a = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size + 1 }, (_, j) => i === j ? 5 : 0));
  for (const r of results) {
    const home = indices.get(r.homeId), away = indices.get(r.awayId);
    const total = r.homeScore + r.awayScore;
    if (home === undefined || away === undefined || total <= 0) continue;
    const features = [[home, 1], [away, -1], [size - 1, 1]];
    const y = r.homeScore / total - 0.5;
    for (const [i, x] of features) {
      a[i][size] += x * y;
      for (const [j, z] of features) a[i][j] += x * z;
    }
  }
  for (let p = 0; p < size; p++) {
    const divisor = a[p][p];
    for (let j = p; j <= size; j++) a[p][j] /= divisor;
    for (let i = 0; i < size; i++) {
      if (i === p) continue;
      const multiplier = a[i][p];
      for (let j = p; j <= size; j++) a[i][j] -= multiplier * a[p][j];
    }
  }
  return { strengths: Object.fromEntries(teamIds.map((id, i) => [id, a[i][size]])), home: a[size - 1][size] };
}

export function predictedHomeShare(model: Model, homeId: string, awayId: string) {
  return clamp(0.5 + (model.strengths[homeId] || 0) - (model.strengths[awayId] || 0) + model.home);
}

function analysePastPredictions(teamIds: string[], results: InsightResult[]) {
  const dated = results.filter(r => r.week !== null);
  const weeks = [...new Set(dated.map(r => r.week!))].sort((a, b) => a - b);
  let count = 0, error = 0, baselineError = 0;
  const residuals: number[] = [];
  for (const week of weeks) {
    const training = dated.filter(r => r.week! < week);
    if (training.length < 20) continue;
    const model = fitStrengths(teamIds, training);
    const baseline = training.reduce((sum, r) => sum + r.homeScore / (r.homeScore + r.awayScore), 0) / training.length;
    for (const r of dated.filter(r => r.week === week)) {
      const total = r.homeScore + r.awayScore;
      const residual = r.homeScore - predictedHomeShare(model, r.homeId, r.awayId) * total;
      residuals.push(residual);
      error += Math.abs(residual);
      baselineError += Math.abs(baseline * total - r.homeScore);
      count++;
    }
  }
  return { residuals, validation: { matches: count, meanAbsoluteLegError: count ? error / count : null,
    baselineLegError: count ? baselineError / count : null } };
}
export function backtest(teamIds: string[], results: InsightResult[]) {
  return analysePastPredictions(teamIds, results).validation;
}
type RemainingFixture = { id: string; week: number | null; homeId: string; awayId: string };
export function getHistoricalLegErrors(teamIds: string[], results: InsightResult[]) {
  return analysePastPredictions(teamIds, results).residuals;
}
function seededRandom(seed: string) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => {
    value += 0x6D2B79F5;
    let t = Math.imul(value ^ value >>> 15, value | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function projectSeason(
  standings: LeagueStanding[], remaining: RemainingFixture[], model: Model,
  matchLegs: number, targetId: string, teamOrder: string[], residuals: number[]
) {
  const order = new Map(teamOrder.map((id, i) => [id, i]));
  const rank = (rows: LeagueStanding[]) => rows.sort((a, b) =>
    b.points - a.points || b.legDiff - a.legDiff || b.legsFor - a.legsFor ||
    (order.get(a.teamId) ?? 0) - (order.get(b.teamId) ?? 0))
    .map((r, i) => ({ ...r, position: i + 1 }));
  const simulate = (sample?: () => number) => {
    const rows = standings.map(row => ({ ...row }));
    const byId = new Map(rows.map(r => [r.teamId, r]));
    for (const f of remaining) {
      const home = byId.get(f.homeId), away = byId.get(f.awayId);
      if (!home || !away) throw new Error("Unknown projected fixture team");
      const expected = predictedHomeShare(model, f.homeId, f.awayId) * matchLegs;
      const hs = sample ? Math.max(0, Math.min(matchLegs, Math.round(expected + sample()))) : expected;
      const as = matchLegs - hs;
      home.legsFor += hs; home.legsAgainst += as; home.played++;
      away.legsFor += as; away.legsAgainst += hs; away.played++;
    }
    for (const row of rows) {
      row.points = row.legsFor - row.deduction;
      row.legDiff = row.legsFor - row.legsAgainst;
    }
    return rank(rows);
  };
  const projected = simulate().map(row => {
    const current = standings.find(t => t.teamId === row.teamId)!;
    return { ...row, currentPosition: current.position, currentPoints: current.points,
      remaining: row.played - current.played, additionalLegs: row.legsFor - current.legsFor };
  });
  const target = projected.find(t => t.teamId === targetId)!;
  const finished = remaining.length === 0;
  const iterations = finished ? 1 : residuals.length >= 20 ? 2000 : 0;
  const positions: number[] = [], points: number[] = [];
  const mean = residuals.length ? residuals.reduce((a, b) => a + b, 0) / residuals.length : 0;
  const random = seededRandom(JSON.stringify({
    scores: standings.map(r => [r.teamId, r.legsFor, r.legsAgainst, r.deduction]),
    fixtures: remaining.map(r => [r.id, r.homeId, r.awayId]), matchLegs, residuals
  }));
  for (let i = 0; i < iterations; i++) {
    const rows = simulate(finished ? undefined : () => residuals[Math.floor(random() * residuals.length)] - mean);
    const team = rows.find(t => t.teamId === targetId)!;
    positions.push(team.position); points.push(team.points);
  }
  const counts = standings.map((_, i) => ({
    position: i + 1, count: positions.filter(p => p === i + 1).length
  })).filter(r => r.count).map(r => ({ ...r, fraction: r.count / iterations }));
  const likely = [...counts].sort((a, b) => b.count - a.count ||
    Math.abs(a.position - target.position) - Math.abs(b.position - target.position) || a.position - b.position)[0];
  const quantile = (values: number[], fraction: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.floor((sorted.length - 1) * fraction)];
  };
  return {
    table: projected, target, iterations, residualSample: residuals.length,
    mostFrequentPosition: likely?.position ?? null, distribution: counts,
    positionRange: iterations ? { low: quantile(positions, 0.1), high: quantile(positions, 0.9) } : null,
    pointsRange: iterations ? { low: quantile(points, 0.1), high: quantile(points, 0.9) } : null
  };
}

export function buildLeagueInsights(data: Awaited<ReturnType<typeof getLiveLeagueData>>) {
  const { league, teams, fixtures, weekDates } = data;
  const standings = calculateLeagueStandings(league.id, teams, fixtures, weekDates);
  const targets = standings.filter(t => t.team.trim().toLowerCase() === TARGET_TEAM.toLowerCase());
  if (targets.length !== 1) throw new Error("Target team not found uniquely");
  const target = targets[0];
  const names = new Map(standings.map(t => [t.teamId, t.team]));
  const ids = standings.map(t => t.teamId);
  const eligible = fixtures.filter(f => f.league_id === league.id &&
    !weekDates.find(w => w.league_id === league.id && w.week === f.week)?.tournament_name &&
    f.home_team_id !== f.away_team_id && names.has(f.home_team_id || "") && names.has(f.away_team_id || ""));
  const validScore = (score: unknown): score is number => typeof score === "number" && Number.isInteger(score) && score >= 0;
  const results: InsightResult[] = eligible.filter(f => f.played &&
    validScore(f.home_score) && validScore(f.away_score) && f.home_score! + f.away_score! > 0)
    .map(f => ({ id: f.id, week: f.week ?? null, homeId: f.home_team_id!, awayId: f.away_team_id!,
      home: names.get(f.home_team_id!)!, away: names.get(f.away_team_id!)!,
      homeScore: f.home_score!, awayScore: f.away_score! }))
    .sort((a, b) => (b.week ?? -1) - (a.week ?? -1) || a.id.localeCompare(b.id));
  const stats = standings.map(row => {
    const matches = results.filter(r => r.homeId === row.teamId || r.awayId === row.teamId);
    const score = (r: InsightResult) => r.homeId === row.teamId ? [r.homeScore, r.awayScore] : [r.awayScore, r.homeScore];
    const totals = (subset: InsightResult[]) => {
      const legsFor = subset.reduce((sum, r) => sum + score(r)[0], 0);
      const legsAgainst = subset.reduce((sum, r) => sum + score(r)[1], 0);
      return { played: subset.length, legsFor, legsAgainst,
        share: legsFor + legsAgainst ? legsFor / (legsFor + legsAgainst) : null };
    };
    const recent = matches.filter(r => r.week !== null).slice(0, 5);
    return { ...row, ...totals(matches), wins: matches.filter(r => score(r)[0] > score(r)[1]).length,
      draws: matches.filter(r => score(r)[0] === score(r)[1]).length,
      losses: matches.filter(r => score(r)[0] < score(r)[1]).length,
      recent: totals(recent), home: totals(matches.filter(r => r.homeId === row.teamId)),
      away: totals(matches.filter(r => r.awayId === row.teamId)),
      form: recent.map(r => score(r)[0] > score(r)[1] ? "W" : score(r)[0] === score(r)[1] ? "D" : "L") };
  });
  const model = fitStrengths(ids, results);
  const totals = [...new Set(results.map(r => r.homeScore + r.awayScore))];
  // Only emit a score forecast when the observed match length is consistent.
  const matchLegs = totals.length === 1 ? totals[0] : null;
  const samples = (id: string) => stats.find(t => t.teamId === id)?.played || 0;
  const future = eligible.filter(f => !f.played && typeof f.week === "number")
    .sort((a, b) => a.week! - b.week! || a.id.localeCompare(b.id));
  const lastPlayedWeek = Math.max(-1, ...results.filter(r => r.week !== null).map(r => r.week!));
  const remainingFixtures = eligible.filter(f => !f.played)
    .sort((a, b) => (a.week ?? Number.MAX_SAFE_INTEGER) - (b.week ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  const { residuals: historicalErrors, validation } = analysePastPredictions(ids, results);
  const fixtureError = historicalErrors.length >= 20 ? [...historicalErrors].sort((a, b) => a - b) : [];
  const forecasts = remainingFixtures.filter(f =>
    f.home_team_id === target.teamId || f.away_team_id === target.teamId).map(f => {
      const home = f.home_team_id === target.teamId;
      const opponentId = home ? f.away_team_id! : f.home_team_id!;
      const share = predictedHomeShare(model, f.home_team_id!, f.away_team_id!);
      const targetShare = home ? share : 1 - share;
      const enough = samples(target.teamId) >= 5 && samples(opponentId) >= 5;
      const expectedLegs = enough && matchLegs !== null ? targetShare * matchLegs : null;
      const meanError = fixtureError.length ? fixtureError.reduce((a, b) => a + b, 0) / fixtureError.length : 0;
      const errors = home ? fixtureError : fixtureError.map(e => -e).reverse();
      const band = expectedLegs !== null && errors.length ? {
        low: Math.max(0, Math.min(matchLegs!, expectedLegs + errors[Math.floor((errors.length - 1) * 0.1)] - (home ? meanError : -meanError))),
        high: Math.max(0, Math.min(matchLegs!, expectedLegs + errors[Math.floor((errors.length - 1) * 0.9)] - (home ? meanError : -meanError)))
      } : null;
      return { id: f.id, week: f.week ?? null, opponentId, opponent: names.get(opponentId)!, home,
        unresolved: f.week == null || f.week <= lastPlayedWeek,
        sample: samples(opponentId), share: enough ? targetShare : null,
        expectedLegs, expectedAgainst: expectedLegs !== null ? matchLegs! - expectedLegs : null, band };
    });
  const missingPlayedScores = eligible.filter(f => f.played).length - results.length;
  const insufficientTeams = ids.filter(id => samples(id) < 5 &&
    remainingFixtures.some(f => f.home_team_id === id || f.away_team_id === id));
  const sourceCapped = fixtures.length >= 500 || weekDates.length >= 300;
  const projectionUnavailable = sourceCapped ? "The source record limit was reached; the full remaining schedule may be missing."
    : missingPlayedScores ? "Some completed fixtures have missing or invalid scores."
    : matchLegs === null ? "There is no consistent match length in the recorded results."
    : insufficientTeams.length ? "Some teams have fewer than five completed games; a full-league forecast is not reliable yet."
    : null;
  // Verify a complete home-and-away round robin from source fixtures, rather
  // than inventing missing games. Non-standard schedules are labelled conditional.
  const coverageVerified = ids.every(homeId => ids.every(awayId => homeId === awayId ||
    eligible.filter(f => f.home_team_id === homeId && f.away_team_id === awayId).length === 1));
  const projection = projectionUnavailable ? null : projectSeason(standings,
    remainingFixtures.map(f => ({ id: f.id, week: f.week ?? null, homeId: f.home_team_id!, awayId: f.away_team_id! })),
    model, matchLegs!, target.teamId, teams.filter(t => ids.includes(t.id)).map(t => t.id), historicalErrors);
  const opponents = stats.filter(t => t.teamId !== target.teamId).map(t => {
    const direct = results.filter(r => (r.homeId === target.teamId && r.awayId === t.teamId) ||
      (r.awayId === target.teamId && r.homeId === t.teamId));
    const vs = (teamId: string, opponentId: string) => {
      const rs = results.filter(r => (r.homeId === teamId && r.awayId === opponentId) ||
        (r.awayId === teamId && r.homeId === opponentId));
      const won = rs.reduce((s, r) => s + (r.homeId === teamId ? r.homeScore : r.awayScore), 0);
      const total = rs.reduce((s, r) => s + r.homeScore + r.awayScore, 0);
      return { played: rs.length, share: total ? won / total : null };
    };
    const common = ids.filter(id => id !== target.teamId && id !== t.teamId)
      .map(id => ({ team: names.get(id)!, target: vs(target.teamId, id), opponent: vs(t.teamId, id) }))
      .filter(r => r.target.played && r.opponent.played);
    return { teamId: t.teamId, team: t.team, direct, common };
  });
  const targetStats = stats.find(t => t.teamId === target.teamId)!;
  const scheduleStrength = targetStats.played ? results
    .filter(r => r.homeId === target.teamId || r.awayId === target.teamId)
    .reduce((sum, r) => sum + (model.strengths[r.homeId === target.teamId ? r.awayId : r.homeId] || 0), 0) / targetStats.played : null;
  return { league: TARGET_LEAGUE, targetTeam: TARGET_TEAM, targetId: target.teamId, checkedAt: data.checkedAt,
    projection, projectionUnavailable, coverageVerified, remainingMatches: remainingFixtures.length,
    source: data.source, teams: stats.map(t => ({ ...t, adjustedStrength: model.strengths[t.teamId] })), results, forecasts, opponents, validation, matchLegs,
    scheduleStrength, adjustedStrength: model.strengths[target.teamId],
    omittedResults: eligible.filter(f => f.played).length - results.length,
    undatedResults: results.filter(r => r.week === null).length,
    unresolvedFixtures: future.filter(f => f.week! <= lastPlayedWeek).length,
    fixtureLimitReached: fixtures.length >= 500, weekLimitReached: weekDates.length >= 300 };
}

export async function getLeagueInsights() {
  return buildLeagueInsights(await getLiveLeagueData());
}
export type LeagueInsights = Awaited<ReturnType<typeof getLeagueInsights>>;
