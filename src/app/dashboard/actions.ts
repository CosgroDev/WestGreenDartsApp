"use server";

import { getPlayerGameLog } from "@/data/stats";

export async function loadPlayerGameLogAction(playerId: string, seasonId: string) {
  if (!playerId) return { ok: false as const, games: [] };
  const games = await getPlayerGameLog(playerId, seasonId || undefined);
  return { ok: true as const, games };
}
