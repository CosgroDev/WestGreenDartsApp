export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getTeamCard } from "@/data/stats";
import { getSeasons } from "@/data/seasons";
import { getFixtures, type Fixture } from "@/data/fixtures";
import { fixtureFocusLabel, selectFixtureFocus, summariseFixture } from "@/lib/fixtureState";
import { ResumeMatch } from "./ResumeMatch";

function fixtureDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(new Date(value));
}

async function FixtureFocus({ fixture }: { fixture: Fixture }) {
  const progress = summariseFixture(fixture.games ?? []);
  const resume = await ResumeMatch({ fixtureId: fixture.id });
  return <section className="card space-y-4 !border-emerald-300" aria-labelledby="fixture-focus-title">
    <div>
      <p className="text-sm font-semibold text-emerald-800">{fixtureFocusLabel(fixture)}</p>
      <h2 id="fixture-focus-title" className="mt-1 text-2xl font-bold break-words">West Green vs {fixture.opponent}</h2>
      <p className="mt-2 text-sm text-slate-600">{fixtureDate(fixture.starts_at)} · {fixture.home ? "Home" : "Away"}</p>
      {fixture.venue && <p className="text-sm text-slate-600 break-words">{fixture.venue}</p>}
    </div>
    <div>
      <p className="text-sm font-medium">{progress.completedMatches} of 6 matches complete</p>
      <progress className="mt-2 h-2 w-full accent-emerald-700" value={progress.completedMatches} max={6} aria-label="Completed matches" />
    </div>
    {resume ?? <Link href={`/fixtures/${fixture.id}`} className="btn-primary">
      {progress.matches.length === 0 ? "Prepare match night" : "View lineup & next match"}
    </Link>}
  </section>;
}

export default async function DashboardPage() {
  const seasons = await getSeasons();
  const currentSeason = seasons.find(s => s.is_current);
  const [team, fixtures] = await Promise.all([
    getTeamCard(currentSeason?.id),
    getFixtures(currentSeason?.id),
  ]);
  const focus = selectFixtureFocus(fixtures);
  const featured = focus.current ?? focus.next;
  const latestResult = fixtures.filter(f => summariseFixture(f.games ?? []).complete)
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())[0];
  const remainingUnfinished = focus.unfinished.filter(f => f.id !== featured?.id);

  return <main className="flex flex-col gap-5 fade-up">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-sm font-semibold text-emerald-800">West Green Darts</p><h1 className="text-3xl font-bold">Home</h1></div>
      {currentSeason ? <span className="chip">Season {currentSeason.name}</span> : <Link href="/settings" className="btn-secondary">Set team season</Link>}
    </header>

    {featured ? <FixtureFocus fixture={featured} /> : <section className="card space-y-3">
      <h2 className="text-lg font-semibold">Ready for the next match night?</h2>
      <p className="text-sm text-slate-600">Add a fixture to prepare your six-match lineup.</p>
      <Link href="/fixtures" className="btn-primary">View fixtures</Link>
    </section>}

    {focus.current && focus.next && <Link href={`/fixtures/${focus.next.id}`} className="card flex items-center justify-between gap-3">
      <div className="min-w-0"><p className="text-sm text-slate-600">Next game</p><p className="font-semibold break-words">{focus.next.opponent}</p><p className="text-sm text-slate-600">{fixtureDate(focus.next.starts_at)}</p></div>
      <span aria-hidden="true">→</span>
    </Link>}

    {remainingUnfinished.length > 0 && <section className="card">
      <h2 className="font-semibold">Unfinished match nights</h2>
      <ul className="mt-2 divide-y divide-slate-200">
        {remainingUnfinished.slice(0, 3).map(f => <li key={f.id}><Link href={`/fixtures/${f.id}`} className="flex min-h-12 items-center justify-between gap-3 py-3">
          <span className="min-w-0 break-words">{f.opponent}<span className="block text-sm text-slate-600">{fixtureDate(f.starts_at)} · {summariseFixture(f.games ?? []).completedMatches}/6 complete</span></span><span aria-hidden="true">→</span>
        </Link></li>)}
      </ul>
      {remainingUnfinished.length > 3 && <Link href="/fixtures" className="btn-secondary mt-3">View all {remainingUnfinished.length} unfinished fixtures</Link>}
    </section>}

    {latestResult && <section className="card space-y-2">
      <p className="text-sm text-slate-600">Latest result</p>
      <h2 className="text-lg font-semibold break-words">West Green vs {latestResult.opponent}</h2>
      <p className="text-sm text-slate-600">{fixtureDate(latestResult.starts_at)} · <span className="capitalize">{latestResult.status}</span></p>
      <Link href={`/fixtures/${latestResult.id}`} className="btn-secondary">View result</Link>
    </section>}

    <section className="card space-y-3">
      <div><h2 className="text-lg font-semibold">Time at the board</h2><p className="mt-1 text-sm text-slate-600">Continue a saved session or choose your next drill.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/practice" className="btn-primary">Start or resume practice</Link><Link href="/pub-games/killer" className="btn-secondary">Play Killer</Link></div>
    </section>

    <section className="card space-y-4">
      <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Season highlights</h2><Link href={`/stats${currentSeason ? `?season=${encodeURIComponent(currentSeason.name)}` : ""}`} className="text-sm font-semibold underline">View Stats</Link></div>
      <dl className="grid grid-cols-3 gap-3">
        <div><dt className="text-sm text-slate-600">Legs won</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{team.legs_won}<span className="text-sm font-normal text-slate-600"> / {team.legs_played}</span></dd></div>
        <div><dt className="text-sm text-slate-600">3-dart average</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{team.three_dart_avg?.toFixed(1) ?? "–"}</dd></div>
        <div><dt className="text-sm text-slate-600">High finish</dt><dd className="mt-1 text-2xl font-bold tabular-nums">{team.high_finish ?? "–"}</dd></div>
      </dl>
    </section>
  </main>;
}
