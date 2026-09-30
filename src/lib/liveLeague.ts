export const LEAGUE_SOURCE = "https://barnsley-darts-flow.base44.app/";
export const BASE44_APP_ID = "69c9134c04089b8c59d07d0e";
export const BASE44_API = `${LEAGUE_SOURCE}api/apps/${BASE44_APP_ID}/entities/`;
export const TARGET_LEAGUE = "Barnsley Townend Monday Night League 2";
export const TARGET_TEAM = "West Green";

export type League = { id: string; name: string };
export type LeagueTeam = { id: string; name: string; league_id: string; number?: number | null; points_deduction?: number | null };
export type LeagueFixture = {
  id: string; league_id: string; week?: number | null; played?: boolean | null;
  home_team_id?: string | null; away_team_id?: string | null;
  home_score?: number | null; away_score?: number | null;
};
export type LeagueWeekDate = { id: string; league_id: string; week?: number | null; tournament_name?: string | null };
export type LeagueStanding = {
  position: number; teamId: string; team: string; points: number;
  played: number; legsFor: number; legsAgainst: number;
  legDiff: number; deduction: number; target?: true;
};
export type LeagueContext = {
  league: string; leagueId: string; targetTeam: string;
  targetPosition: number; targetPoints: number;
  standings: LeagueStanding[]; checkedAt: string; source: string;
};

const normalise = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();

// Port of rD in the public site's index-eIT8_834.js, investigated 2026-09-30.
// Preserve input team order when every comparator ties: JS sort is stable.
export function calculateLeagueStandings(
  leagueId: string, teams: LeagueTeam[], fixtures: LeagueFixture[], weekDates: LeagueWeekDate[] = []
): LeagueStanding[] {
  const leagueFixtures = fixtures.filter(f => {
    if (f.league_id !== leagueId) return false;
    // The homepage excludes tournament weeks before passing fixtures to rD.
    // Use the first matching WeekDate, exactly as the source's Array.find.
    const week = weekDates.find(w => w.league_id === leagueId && w.week === f.week);
    return !week?.tournament_name;
  });
  const standings = teams
    .filter(t => t.league_id === leagueId && t.number !== 14 && !t.name.toLowerCase().includes("no game"))
    .map(team => {
      let played = 0, legsFor = 0, legsAgainst = 0;
      for (const fixture of leagueFixtures) {
        if (!fixture.played || (fixture.home_team_id !== team.id && fixture.away_team_id !== team.id)) continue;
        played++;
        const home = fixture.home_team_id === team.id;
        legsFor += (home ? fixture.home_score : fixture.away_score) || 0;
        legsAgainst += (home ? fixture.away_score : fixture.home_score) || 0;
      }
      const deduction = team.points_deduction || 0;
      return { teamId: team.id, team: team.name, played, legsFor, legsAgainst,
        deduction, legDiff: legsFor - legsAgainst, points: legsFor - deduction };
    });
  standings.sort((a, b) => b.points - a.points || b.legDiff - a.legDiff || b.legsFor - a.legsFor);
  return standings.map((row, i) => ({ ...row, position: i + 1 }));
}

export function getLeagueWindow(standings: LeagueStanding[], targetTeam = TARGET_TEAM): LeagueStanding[] {
  const matches = standings.filter(row => normalise(row.team) === normalise(targetTeam));
  if (matches.length !== 1) throw new Error("The target team could not be uniquely identified");
  const index = standings.indexOf(matches[0]);
  return standings.slice(Math.max(0, index - 3), index + 4)
    .map(row => row.teamId === matches[0].teamId ? { ...row, target: true as const } : row);
}

type Entity = League | LeagueTeam | LeagueFixture | LeagueWeekDate;
async function readEntities<T extends Entity>(path: string, kind: "League" | "Team" | "Fixture" | "WeekDate"): Promise<T[]> {
  const response = await fetch(BASE44_API + path, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`League source returned ${response.status} for ${kind}`);
  const rows: unknown = await response.json();
  if (!Array.isArray(rows)) throw new Error(`Unexpected ${kind} response`);
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || ids.has(row.id)) {
      throw new Error(`Invalid or duplicate ${kind} record`);
    }
    ids.add(row.id);
    if ((kind === "League" || kind === "Team") && typeof row.name !== "string") throw new Error(`Invalid ${kind} name`);
    if (kind !== "League" && typeof row.league_id !== "string") throw new Error(`Invalid ${kind} league link`);
    for (const field of kind === "Team" ? ["points_deduction", "number"] : kind === "Fixture" ? ["home_score", "away_score", "week"] : kind === "WeekDate" ? ["week"] : []) {
      if (row[field] != null && (typeof row[field] !== "number" || !Number.isFinite(row[field]))) {
        throw new Error(`Invalid ${kind} ${field}`);
      }
    }
    if (kind === "Fixture" && row.played != null && typeof row.played !== "boolean") throw new Error("Invalid played flag");
  }
  return rows as T[];
}

export async function getLiveLeagueData() {
  // These are the exact four requests used for the source's home table.
  // Keep its global fixture limit/order to reproduce the source, rather than
  // silently changing standings by loading a different set of fixtures.
  const [leagues, teams, fixtures, weekDates] = await Promise.all([
    readEntities<League>("League", "League"),
    readEntities<LeagueTeam>("Team", "Team"),
    readEntities<LeagueFixture>("Fixture?sort=-updated_date&limit=500", "Fixture"),
    readEntities<LeagueWeekDate>("WeekDate?sort=-created_date&limit=300", "WeekDate")
  ]);
  const matches = leagues.filter(l => normalise(l.name) === normalise(TARGET_LEAGUE));
  if (matches.length !== 1) throw new Error("The target league could not be uniquely identified");
  const league = matches[0];
  return { league, teams, fixtures, weekDates, checkedAt: new Date().toISOString(), source: LEAGUE_SOURCE };
}

export function buildLeagueContext(data: Awaited<ReturnType<typeof getLiveLeagueData>>): LeagueContext {
  const { league, teams, fixtures, weekDates, checkedAt } = data;
  const standings = getLeagueWindow(calculateLeagueStandings(league.id, teams, fixtures, weekDates));
  const target = standings.find(row => row.target)!;
  return {
    league: TARGET_LEAGUE, leagueId: league.id, targetTeam: TARGET_TEAM,
    targetPosition: target.position, targetPoints: target.points,
    standings, checkedAt, source: LEAGUE_SOURCE
  };
}

export async function getWestGreenLeagueContext(): Promise<LeagueContext> {
  return buildLeagueContext(await getLiveLeagueData());
}
