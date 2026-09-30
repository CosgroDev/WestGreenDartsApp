export const LEAGUE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const LEAGUE_REFRESH_DESCRIPTION = "Auto-refresh every 5 minutes from Monday 8pm to Tuesday 11:59pm (UK time). Manual refresh is always available.";
const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London", weekday: "short", hour: "2-digit", hourCycle: "h23"
});
export function isLeagueRefreshWindow(now = new Date()) {
  const parts = clock.formatToParts(now);
  const day = parts.find(p => p.type === "weekday")?.value;
  const hour = Number(parts.find(p => p.type === "hour")?.value);
  return day === "Tue" || (day === "Mon" && hour >= 20);
}
export function shouldRefreshLeague(checkedAt: string, now = new Date()) {
  return isLeagueRefreshWindow(now) &&
    (!Number.isFinite(Date.parse(checkedAt)) || now.getTime() - Date.parse(checkedAt) >= LEAGUE_REFRESH_INTERVAL_MS);
}
