import { KillerClient } from "./KillerClient";
import { getPlayers } from "@/data/players";
export const dynamic = "force-dynamic";
export default async function KillerPage() {
  const players = await getPlayers();
  return (
    <KillerClient roster={players.filter((p) => p.active).map((p) => p.name)} />
  );
}
