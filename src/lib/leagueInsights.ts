import { calculateLeagueStandings, getLiveLeagueData, TARGET_TEAM, TARGET_LEAGUE } from "./liveLeague";

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

export function backtest(teamIds: string[], results: InsightResult[]) {
  const dated = results.filter(r => r.week !== null);
  const weeks = [...new Set(dated.map(r => r.week!))].sort((a, b) => a - b);
  let count = 0, error = 0, baselineError = 0;
  for (const week of weeks) {
    const training = dated.filter(r => r.week! < week);
    if (training.length < 20) continue;
    const model = fitStrengths(teamIds, training);
    const baseline = training.reduce((sum, r) => sum + r.homeScore / (r.homeScore + r.awayScore), 0) / training.length;
    for (const r of dated.filter(r => r.week === week)) {
      const total = r.homeScore + r.awayScore;
      error += Math.abs(predictedHomeShare(model, r.homeId, r.awayId) * total - r.homeScore);
      baselineError += Math.abs(baseline * total - r.homeScore);
      count++;
    }
  }
  return { matches: count, meanAbsoluteLegError: count ? error / count : null,
    baselineLegError: count ? baselineError / count : null };
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
  const forecasts = future.filter(f => f.week! > lastPlayedWeek &&
    (f.home_team_id === target.teamId || f.away_team_id === target.teamId)).map(f => {
      const home = f.home_team_id === target.teamId;
      const opponentId = home ? f.away_team_id! : f.home_team_id!;
      const share = predictedHomeShare(model, f.home_team_id!, f.away_team_id!);
      const targetShare = home ? share : 1 - share;
      const enough = samples(target.teamId) >= 5 && samples(opponentId) >= 5;
      return { id: f.id, week: f.week!, opponentId, opponent: names.get(opponentId)!, home,
        sample: samples(opponentId), share: enough ? targetShare : null,
        expectedLegs: enough && matchLegs !== null ? targetShare * matchLegs : null };
    });
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
  const validation = backtest(ids, results);
  const targetStats = stats.find(t => t.teamId === target.teamId)!;
  const scheduleStrength = targetStats.played ? results
    .filter(r => r.homeId === target.teamId || r.awayId === target.teamId)
    .reduce((sum, r) => sum + (model.strengths[r.homeId === target.teamId ? r.awayId : r.homeId] || 0), 0) / targetStats.played : null;
  return { league: TARGET_LEAGUE, targetTeam: TARGET_TEAM, targetId: target.teamId, checkedAt: data.checkedAt,
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
