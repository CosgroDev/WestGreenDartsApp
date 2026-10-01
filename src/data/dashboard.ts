import { getPlayerCards, getTeamCard, loadSeasonStatistics } from "./stats";
import { getPlayerForm } from "./form";
import { getSeasonToDate } from "./seasonSummary";
export async function getDashboardStatistics(seasonId?: string) {
  const shared = await loadSeasonStatistics(seasonId);
  const [players, team, playerForm, seasonToDate] = await Promise.all([
    getPlayerCards(seasonId, false, shared), getTeamCard(seasonId, shared),
    getPlayerForm(seasonId, shared),
    seasonId ? getSeasonToDate(seasonId, shared.games) : Promise.resolve(null)
  ]);
  return { players, team, playerForm, seasonToDate };
}
