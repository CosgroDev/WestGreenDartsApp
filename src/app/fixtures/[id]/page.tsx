import Link from "next/link";
import { notFound } from "next/navigation";
import { getFixtureById } from "@/data/fixtures";
import { getPlayers } from "@/data/players";
import { getGamesForFixture, type Game } from "@/data/games";
import { deleteMatchAction } from "./actions";
import { CreateGameForm } from "./CreateGameClient";

type Props = { params: { id: string } };

type MatchGroup = {
  matchKey: string;
  games: Game[];
  westWins: number;
  oppWins: number;
  resultLabel: string;
  status: string;
  latestGameId?: string;
  westPlayerName: string;
  opponentPlayer: string;
  leastDarts: number | null;
  highFinish: number | null;
  threeDA: number | null;
  firstNine: number | null;
  twentySix: number;
};

export default async function FixtureDetailPage({ params }: Props) {
  const [fixture, players, games] = await Promise.all([
    getFixtureById(params.id),
    getPlayers(),
    getGamesForFixture(params.id),
  ]);
  if (!fixture) return notFound();

  const grouped: MatchGroup[] = Array.from(
    games.reduce((map, g) => {
      const opponentKey = (g.opponent_player || "").trim().toLowerCase();
      const key = `${g.west_green_player_id || "none"}|${opponentKey}`;
      const list = map.get(key) ?? [];
      list.push(g);
      map.set(key, list);
      return map;
    }, new Map<string, Game[]>()),
  ).map(([key, list]) => {
    const sorted = [...list].sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    const westWins = sorted.filter((g) => g.winner === "west_green").length;
    const oppWins = sorted.filter((g) => g.winner === "opponent").length;
    const latestInProgress = sorted.find((g) => g.status === "in_progress");
    const latest = latestInProgress ?? sorted[sorted.length - 1];
    const isDrawMatch =
      latest?.status === "completed" && latest.winner === null;
    const displayWestWins = isDrawMatch ? 1 : westWins;
    const displayOppWins = isDrawMatch ? 1 : oppWins;
    const leastDarts = sorted.reduce<number | null>((min, g) => {
      if (g.darts_thrown == null) return min;
      if (min === null) return g.darts_thrown;
      return Math.min(min, g.darts_thrown);
    }, null);
    const highFinish = sorted.reduce<number | null>((max, g) => {
      if (g.high_finish == null) return max;
      if (max === null) return g.high_finish;
      return Math.max(max, g.high_finish);
    }, null);
    const agg = sorted.reduce(
      (acc, g) => {
        if (g.three_dart_avg != null) {
          acc.threeDaTotal += g.three_dart_avg;
          acc.threeDaCount += 1;
        }
        if (g.first_nine_avg != null) {
          acc.first9Total += g.first_nine_avg;
          acc.first9Count += 1;
        }
        acc.t26 += g.twenty_six ?? 0;
        return acc;
      },
      {
        threeDaTotal: 0,
        threeDaCount: 0,
        first9Total: 0,
        first9Count: 0,
        t26: 0,
      },
    );
    const threeDA =
      agg.threeDaCount > 0 ? agg.threeDaTotal / agg.threeDaCount : null;
    const firstNine =
      agg.first9Count > 0 ? agg.first9Total / agg.first9Count : null;
    const twentySix = agg.t26;
    const resultLabel =
      isDrawMatch || displayWestWins === displayOppWins
        ? "Draw"
        : displayWestWins > displayOppWins
          ? "West Green win"
          : `${fixture.opponent} win`;

    return {
      matchKey: key,
      games: sorted,
      westWins: displayWestWins,
      oppWins: displayOppWins,
      resultLabel,
      status: latest?.status ?? "in_progress",
      latestGameId: latest?.id,
      westPlayerName: sorted[0]?.west_green_player_name || "TBD",
      opponentPlayer: sorted[0]?.opponent_player || "Opponent",
      leastDarts,
      highFinish,
      threeDA,
      firstNine,
      twentySix,
    };
  });

  const maxGames = 6;
  const disableCreate = grouped.length >= maxGames;

  const westLegsTotal = grouped.reduce((sum, g) => sum + g.westWins, 0);
  const oppLegsTotal = grouped.reduce((sum, g) => sum + g.oppWins, 0);
  const legDiff = westLegsTotal - oppLegsTotal;
  const resultLabel =
    westLegsTotal > oppLegsTotal
      ? "West Green win"
      : oppLegsTotal > westLegsTotal
        ? `${fixture.opponent} win`
        : "Draw";
  const resultTone =
    westLegsTotal > oppLegsTotal
      ? "emerald"
      : oppLegsTotal > westLegsTotal
        ? "red"
        : "amber";

  const leastDartsOverall = games.reduce<number | null>((min, g) => {
    if (g.darts_thrown == null) return min;
    if (min === null) return g.darts_thrown;
    return Math.min(min, g.darts_thrown);
  }, null);
  const highFinishOverall = games.reduce<number | null>((max, g) => {
    if (g.high_finish == null) return max;
    if (max === null) return g.high_finish;
    return Math.max(max, g.high_finish);
  }, null);
  const totalTwentySix = games.reduce<number>(
    (sum, g) => sum + (g.twenty_six ?? 0),
    0,
  );

  return (
    <main className="flex flex-col gap-4">
      {/* header omitted for brevity — keep your existing markup */}
      {/* ... */}

      {/* Fixture summary (keep your existing markup) */}

      <section className="card">
        <h3 className="text-lg font-semibold mb-3">
          Create game {grouped.length}/{maxGames}
        </h3>
        {disableCreate && (
          <p className="text-sm text-red-600 mb-2">
            Maximum of 6 games per fixture reached.
          </p>
        )}
        <CreateGameForm
          fixtureId={fixture.id}
          disable={disableCreate}
          players={players}
        />
      </section>

      {/* Games list (keep your existing markup, unchanged) */}
    </main>
  );
}
