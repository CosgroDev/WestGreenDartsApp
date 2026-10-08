export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { notFound } from "next/navigation";
import { getFixtureById } from "@/data/fixtures";
import { getPlayers } from "@/data/players";
import { getGamesForFixture } from "@/data/games";
import { fixtureFocusLabel, groupFixtureMatches, summariseFixture, MATCHES_PER_FIXTURE } from "@/lib/fixtureState";
import { deleteMatchAction } from "./actions";
import { CreateGameForm } from "./CreateGameClient";
import { TeamAiReview } from "./TeamAiReview";
import { ConfirmDeleteForm } from "../ConfirmDeleteForm";

export default async function FixtureDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams?: Promise<{ season?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [fixture, players, games] = await Promise.all([getFixtureById(id), getPlayers(), getGamesForFixture(id)]);
  if (!fixture) return notFound();
  const state = summariseFixture(games);
  const matches = groupFixtureMatches(games);
  const slots = new Map(matches.filter(m => m.position != null).map(m => [m.position!, m]));
  for (const match of matches.filter(m => m.position == null)) {
    let position = 1;
    while (slots.has(position)) position++;
    slots.set(position, match);
  }
  const season = query?.season;
  const fixturesHref = season ? `/fixtures?${new URLSearchParams({ season })}` : "/fixtures";
  const result = !state.complete ? "Night unfinished" : state.status === "win" ? "West Green win" : state.status === "loss" ? `${fixture.opponent} win` : "Draw";
  const live = matches.find(m => !m.complete && m.games.some(g => g.status === "in_progress"));
  const liveGame = live?.games.find(g => g.status === "in_progress");
  const scoringHref = (gameId: string) => `/scoring?${new URLSearchParams({ game: gameId, fixture: id, home: fixture.home ? "1" : "0", ...(season ? { season } : {}) })}`;
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(fixture.starts_at));
  const leastDarts = games.filter(g => g.darts_thrown != null).reduce<number | null>((n, g) => n == null ? g.darts_thrown! : Math.min(n, g.darts_thrown!), null);
  const highFinish = games.reduce((n, g) => Math.max(n, g.high_finish ?? 0), 0);

  return <main className="flex flex-col gap-4">
    <header className="card flex flex-col gap-3">
      <Link href={fixturesHref} className="self-start text-sm text-emerald-700 underline">← Fixtures</Link>
      <p className="text-sm text-slate-500">{fixture.season} · {fixture.home ? "Home" : "Away"}</p>
      <h1 className="text-2xl font-bold break-words">West Green vs {fixture.opponent}</h1>
      <p>{date} · UK time</p>
      {fixture.venue && <p className="text-slate-600">{fixture.venue}</p>}
      {fixture.notes && <p className="text-sm text-slate-500">{fixture.notes}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <div>
          <p className="font-semibold">{state.complete ? result : fixtureFocusLabel(fixture)}</p>
          <p className="text-sm text-slate-600">{state.completedMatches} of 6 matches complete · Legs {state.legsFor}–{state.legsAgainst}</p>
        </div>
        {liveGame ? <Link className="btn-primary" href={scoringHref(liveGame.id)}>Resume scoring</Link> : matches.length < MATCHES_PER_FIXTURE ? <a className="btn-primary" href="#create-match">Start next match</a> : null}
      </div>
    </header>

    <section className="card" aria-labelledby="lineup-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 id="lineup-title" className="text-lg font-semibold">Match lineup</h2>
        <span className="text-sm text-slate-500">Six matches · two legs each</span>
      </div>
      <ol className="flex flex-col gap-3">
        {Array.from({ length: Math.max(6, matches.length) }, (_, i) => {
          const match = slots.get(i + 1);
          if (!match) return <li key={`empty-${i}`} className="rounded-lg border border-dashed border-slate-300 p-3">
            <p className="text-sm text-slate-500">Match {i + 1}</p><p className="font-semibold">Available position</p>
          </li>;
          const first = match.games[0];
          const activeGame = match.games.find(g => g.status === "in_progress");
          const last = match.games[match.games.length - 1];
          const label = !match.complete ? activeGame ? "In progress" : "Awaiting second leg" : match.result === "win" ? "West Green win" : match.result === "loss" ? `${fixture.opponent} win` : "Draw";
          return <li key={match.key} className="rounded-lg border border-slate-200 p-3 flex flex-col gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <p className="text-sm text-slate-500">Match {match.position ?? i + 1}</p>
              <h3 className="font-semibold break-words">{first.west_green_player_name ?? "West Green player"} vs {first.opponent_player}</h3>
              <p className="text-sm">{label} · Legs {match.westWins}–{match.oppWins}</p>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {!match.complete ? <Link className="btn-primary" href={scoringHref(activeGame?.id ?? last.id)}>{activeGame ? "Score now" : "Continue match"}</Link> : <Link className="btn-secondary" href={`/matches/${last.id}?${new URLSearchParams({ fixture: id, ...(season ? { season } : {}) })}`}>View match</Link>}
              <ConfirmDeleteForm action={deleteMatchAction} label={`Delete match ${match.position ?? i + 1}`} description={`Delete ${first.west_green_player_name ?? "West Green player"} vs ${first.opponent_player} and its recorded scores? This position will become available.`} fields={{ fixtureId: id, matchId: first.match_id ?? "", opponent: first.opponent_player, westId: first.west_green_player_id ?? "" }} />
            </div>
          </li>;
        })}
      </ol>
    </section>

    {matches.length < MATCHES_PER_FIXTURE && <section id="create-match" className="card scroll-mt-4">
      <h2 className="text-lg font-semibold mb-2">Start next match</h2>
      <p className="text-sm text-slate-500 mb-3">Choose the players. Scoring opens straight away in the next available position.</p>
      <CreateGameForm fixtureId={id} disable={false} players={players.filter(player => player.active)} season={season} />
    </section>}

    <details className="card">
      <summary className="cursor-pointer font-semibold">Night statistics</summary>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <p>Completed matches: <strong>{state.completedMatches}/6</strong></p>
        <p>W / D / L: <strong>{state.matchWins} / {state.matchDraws} / {state.matchLosses}</strong></p>
        <p>Least darts: <strong>{leastDarts ?? "—"}</strong></p>
        <p>Highest checkout: <strong>{highFinish || "—"}</strong></p>
      </div>
      {!state.complete && <p className="mt-3 text-sm text-slate-500">The fixture result is confirmed after all six matches finish.</p>}
    </details>

    {state.complete && <details className="card">
      <summary className="cursor-pointer font-semibold">Team performance review</summary>
      <div className="mt-3"><TeamAiReview fixtureId={id} configured={Boolean(process.env.ANTHROPIC_API_KEY)} initialReview={fixture.aiTeamReview} /></div>
    </details>}
  </main>;
}
