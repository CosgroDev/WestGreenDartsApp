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

<<<<<<< HEAD
      <section className="card">
        <h3 className="text-lg font-semibold mb-3">
          Create game {grouped.length}/{maxGames}
        </h3>
        {disableCreate && (
          <p className="text-sm text-red-600 mb-2">
            Maximum of 6 games per fixture reached.
          </p>
=======
<section className="card">
  <h3 className="text-lg font-semibold mb-3">
    Create game {grouped.length}/{maxGames}
  </h3>
  {disableCreate && <p className="text-sm text-red-600 mb-2">Maximum of 6 games per fixture reached.</p>}
  <CreateGameForm fixtureId={fixture.id} disable={disableCreate} players={players} />
</section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Games</h2>
        {!grouped.length ? (
          <div className="border border-dashed border-slate-200 rounded-md p-3 text-sm text-slate-600">
            No games yet. Create one below.
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2 mb-4">
              {grouped.filter((g) => g.status === "in_progress").length === 0 ? (
                <p className="text-sm text-slate-600">All games completed.</p>
              ) : (
                grouped
                  .filter((g) => g.status === "in_progress")
                  .map((match, idx) => (
                    <div
                      key={match.matchKey}
                      className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm text-slate-600">Game {idx + 1}</span>
                        <span className="font-semibold">
                          {match.westPlayerName} vs {match.opponentPlayer}
                        </span>
                        <span className="text-sm text-slate-600">Result: In progress</span>
                        {match.leastDarts !== null && match.leastDarts !== undefined && (
                          <span className="text-xs text-slate-500">Least darts: {match.leastDarts}</span>
                        )}
                        <span className="text-xs text-slate-500">High checkout: —</span>
                        <div className="flex gap-3 mt-1">
                          {match.latestGameId && (
                            <Link
                              href={`/scoring?game=${match.latestGameId}&fixture=${fixture.id}&home=${fixture.home ? "1" : "0"}`}
                              className="text-sm text-emerald-700 underline"
                            >
                              Open scoring
                            </Link>
                          )}
                          {match.latestGameId && (
                            <Link
                              href={`/scoring?game=${match.latestGameId}&fixture=${fixture.id}&home=${fixture.home ? "1" : "0"}#summary`}
                              className="text-sm text-slate-600 underline"
                            >
                              View summary
                            </Link>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 items-start">
                        <form action={deleteMatchAction}>
                          <input type="hidden" name="fixtureId" value={fixture.id} />
                          <input type="hidden" name="opponent" value={match.opponentPlayer} />
                          <input
                            type="hidden"
                            name="westId"
                            value={match.matchKey.split("|")[0] === "none" ? "" : match.matchKey.split("|")[0]}
                          />
                          <button
                            title="Delete game"
                            className="rounded-full border border-slate-300 w-8 h-8 flex items-center justify-center text-slate-500 hover:border-red-200 hover:text-red-600"
                          >
                            x
                          </button>
                        </form>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <details className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                Show completed games ({grouped.filter((g) => g.status !== "in_progress").length})
              </summary>
              <div className="flex flex-col gap-2 mt-2">
                {grouped
                  .filter((g) => g.status !== "in_progress")
                  .map((match, idx) => (
                    <div
                      key={match.matchKey + "-done"}
                      className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm hover:border-emerald-200 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-slate-500">Game {idx + 1}</span>
                          <span className="text-base font-semibold">
                            {match.westPlayerName} vs {match.opponentPlayer}
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                match.westWins > match.oppWins
                                  ? "bg-emerald-100 text-emerald-800"
                                  : match.westWins < match.oppWins
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {match.westWins > match.oppWins ? "W" : match.westWins < match.oppWins ? "L" : "D"}
                            </span>
                            <span className="text-sm text-slate-700">
                              {match.resultLabel} ({match.westWins}-{match.oppWins})
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 space-x-3 mt-1">
                            {match.leastDarts !== null && match.leastDarts !== undefined && (
                              <span>Least darts: {match.leastDarts}</span>
                            )}
                            <span>
                              High checkout:{" "}
                              {match.highFinish !== null && match.highFinish !== undefined && match.highFinish > 0
                                ? match.highFinish
                                : "—"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-600 space-x-3">
                            <span>3DA: {match.threeDA !== null ? match.threeDA.toFixed(1) : "—"}</span>
                            <span>First9: {match.firstNine !== null ? match.firstNine.toFixed(1) : "—"}</span>
                            <span>26s: {match.twentySix}</span>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          {match.latestGameId && (
                            <Link
                              href={`/scoring?game=${match.latestGameId}&fixture=${fixture.id}&home=${fixture.home ? "1" : "0"}#summary`}
                              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 hover:border-emerald-200 hover:text-emerald-700"
                              title="View summary"
                            >
                              🔍
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </details>
          </>
>>>>>>> 39f60660b9e3433661e89397dcc697ec8ede7b89
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
