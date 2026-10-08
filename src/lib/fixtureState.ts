import { matchKey } from "./matchKey";

export const MATCHES_PER_FIXTURE = 6;
export type FixtureStatus = "scheduled" | "in_progress" | "win" | "loss" | "draw";
export type FixtureLeg = {
  id?: string;
  match_id?: string | null;
  fixture_id?: string;
  match_position?: number | null;
  west_green_player_id?: string | null;
  opponent_player?: string | null;
  status: string;
  winner: string | null;
  deleted?: boolean | null;
  created_at?: string;
};

/** A match is two finished legs, or one historical row recording a draw. */
export function groupFixtureMatches<T extends FixtureLeg>(games: T[]) {
  const groups = new Map<string, T[]>();
  for (const game of games) {
    if (game.deleted === true) continue;
    const key = matchKey(game);
    const legs = groups.get(key) ?? [];
    legs.push(game);
    groups.set(key, legs);
  }
  return Array.from(groups, ([key, legs]) => {
    const sorted = [...legs].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? "") || (a.id ?? "").localeCompare(b.id ?? ""));
    const historicalDraw = sorted.length === 1 && sorted[0].status === "completed" && sorted[0].winner === null;
    const complete = historicalDraw || (sorted.length === 2 && sorted.every(g => g.status === "completed" && (g.winner === "west_green" || g.winner === "opponent")));
    const westWins = historicalDraw ? 1 : sorted.filter(g => g.status === "completed" && g.winner === "west_green").length;
    const oppWins = historicalDraw ? 1 : sorted.filter(g => g.status === "completed" && g.winner === "opponent").length;
    const result: "win" | "loss" | "draw" | null = !complete ? null : westWins > oppWins ? "win" : westWins < oppWins ? "loss" : "draw";
    return { key, games: sorted, complete, result, westWins, oppWins, position: sorted[0]?.match_position ?? null };
  }).sort((a, b) => (a.position ?? 99) - (b.position ?? 99) || (a.games[0]?.created_at ?? "").localeCompare(b.games[0]?.created_at ?? "") || a.key.localeCompare(b.key));
}

export function summariseFixture(games: FixtureLeg[]) {
  const matches = groupFixtureMatches(games);
  const completed = matches.filter(m => m.complete);
  const complete = matches.length === MATCHES_PER_FIXTURE && completed.length === MATCHES_PER_FIXTURE;
  const matchWins = completed.filter(m => m.result === "win").length;
  const matchDraws = completed.filter(m => m.result === "draw").length;
  const matchLosses = completed.filter(m => m.result === "loss").length;
  const legsFor = matches.reduce((n, m) => n + m.westWins, 0);
  const legsAgainst = matches.reduce((n, m) => n + m.oppWins, 0);
  const status: FixtureStatus = !complete ? matches.length ? "in_progress" : "scheduled" : matchWins > matchLosses ? "win" : matchWins < matchLosses ? "loss" : "draw";
  return { status, complete, matches, completedMatches: completed.length, matchWins, matchDraws, matchLosses, legsFor, legsAgainst };
}

export function londonDate(value: string | Date) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** datetime-local represents UK wall time; reject the missing hour at spring DST. */
export function londonLocalToISO(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(parsed)) return null;
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  for (const offset of [60, 0]) {
    const candidate = new Date(parsed - offset * 60_000);
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map(p => [p.type, p.value]));
    if (`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` === value) return candidate.toISOString();
  }
  return null;
}

type DatedFixture = { starts_at: string; status?: FixtureStatus; games?: FixtureLeg[] };
function isComplete(fixture: DatedFixture) {
  return fixture.games ? summariseFixture(fixture.games).complete : fixture.status === "win" || fixture.status === "loss" || fixture.status === "draw";
}

export function fixtureFocusLabel(fixture: Pick<DatedFixture, "starts_at">, now = new Date()) {
  const date = londonDate(fixture.starts_at);
  const today = londonDate(now);
  return date === today ? "Tonight’s game" : date < today ? "Current game · Unfinished" : "Next game";
}

/** Tonight leads; older unfinished nights remain accessible until all six finish. */
export function selectFixtureFocus<T extends DatedFixture>(fixtures: T[], now = new Date()) {
  const today = londonDate(now);
  const active = fixtures.filter(f => !isComplete(f) && londonDate(f.starts_at));
  const byTime = (a: T, b: T) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
  const tonight = active.filter(f => londonDate(f.starts_at) === today).sort(byTime);
  const unfinished = active.filter(f => londonDate(f.starts_at) < today).sort((a, b) => byTime(b, a));
  const next = active.filter(f => londonDate(f.starts_at) > today).sort(byTime)[0] ?? null;
  return { current: tonight[0] ?? unfinished[0] ?? null, next, unfinished };
}
