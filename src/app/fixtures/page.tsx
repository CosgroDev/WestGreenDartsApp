export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getFixtures, type Fixture } from "@/data/fixtures";
import { getSeasons } from "@/data/seasons";
import { getPlayerForm, suggestTeam } from "@/data/form";
import { FormPills } from "@/components/FormPills";
import { fixtureFocusLabel, londonDate, selectFixtureFocus } from "@/lib/fixtureState";
import { deleteFixtureAction } from "./actions";
import { CreateFixtureForm } from "./CreateFixtureForm";
import { SeasonFilter } from "./SeasonFilter";
import { ConfirmDeleteForm } from "./ConfirmDeleteForm";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}

export default async function FixturesPage({ searchParams }: { searchParams?: Promise<{ season?: string }> }) {
  const [query, seasons] = await Promise.all([searchParams, getSeasons()]);
  const uniqueSeasons = seasons.filter((s, i, arr) => arr.findIndex(t => t.name === s.name) === i);
  const current = uniqueSeasons.find(s => s.is_current) ?? uniqueSeasons[0];
  const selected = query?.season ?? current?.name ?? "all";
  const seasonId = selected === "all" ? undefined : uniqueSeasons.find(s => s.name === selected)?.id;
  const fixtures = selected !== "all" && !seasonId ? [] : await getFixtures(seasonId);
  const now = new Date();
  const focus = selectFixtureFocus(fixtures, now);
  const highlighted = focus.current ?? focus.next;
  const upcoming = focus.next;
  const active = fixtures.filter(f => f.status === "scheduled" || f.status === "in_progress");
  const rank = (f: Fixture) => londonDate(f.starts_at) === londonDate(now) ? 0 : londonDate(f.starts_at) > londonDate(now) ? 1 : 2;
  active.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at)));
  const completed = fixtures.filter(f => f.status === "win" || f.status === "loss" || f.status === "draw").sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const suggestion = upcoming ? suggestTeam(await getPlayerForm(seasonId)) : null;
  const href = (f: Fixture) => `/fixtures/${f.id}?${new URLSearchParams({ season: selected })}`;
  const statusLabel = (f: Fixture) => f.status === "win" ? "Win" : f.status === "loss" ? "Loss" : f.status === "draw" ? "Draw" : f.status === "in_progress" ? "Unfinished" : "Scheduled";

  const row = (f: Fixture) => <article key={f.id} className="rounded-lg border border-slate-200 p-3">
    <Link href={href(f)} className="block min-w-0">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500"><span>{f.home ? "Home" : "Away"}</span><span>·</span><span>{statusLabel(f)}</span></div>
      <h3 className="font-semibold break-words mt-1">West Green vs {f.opponent}</h3>
      <p className="text-sm text-slate-600 mt-1">{formatDate(f.starts_at)}</p>
      {f.venue && <p className="text-sm text-slate-500 break-words">{f.venue}</p>}
      <p className="text-sm text-slate-600 mt-2">{f.completed_matches} of 6 matches complete <span className="text-emerald-700">· Open fixture →</span></p>
    </Link>
    {f.games_count === 0 && <div className="mt-3"><ConfirmDeleteForm action={deleteFixtureAction} fields={{ fixtureId: f.id }} label="Delete fixture" description={`Delete the fixture against ${f.opponent}?`} /></div>}
  </article>;

  return <main className="flex flex-col gap-4">
    <header className="card">
      <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Fixtures</h1><p className="mt-1 text-sm text-slate-500">Match nights, lineups and results</p></div><Link href="/settings" className="btn-secondary text-sm">Settings</Link></div>
      <div className="mt-4"><SeasonFilter seasonNames={uniqueSeasons.map(s => s.name)} selected={selected} /></div>
    </header>

    {highlighted && <section className="card border-emerald-200">
      <p className="text-sm font-semibold text-emerald-700">{fixtureFocusLabel(highlighted, now)}</p>
      <h2 className="text-xl font-semibold break-words mt-2">West Green vs {highlighted.opponent}</h2>
      <p className="text-sm text-slate-600 mt-1">{highlighted.home ? "Home" : "Away"} · {formatDate(highlighted.starts_at)}</p>
      {highlighted.venue && <p className="text-sm text-slate-500 mt-1">{highlighted.venue}</p>}
      <p className="mt-3">{highlighted.completed_matches} of 6 matches complete</p>
      <Link href={href(highlighted)} className="btn-primary inline-flex mt-3">Open lineup and score</Link>
      {focus.current && focus.next && <p className="mt-4 text-sm text-slate-500">Next: <Link href={href(focus.next)} className="underline">{focus.next.opponent} · {formatDate(focus.next.starts_at)}</Link></p>}
    </section>}

    <section className="card">
      <h2 className="text-lg font-semibold">Upcoming and unfinished <span className="text-sm font-normal text-slate-500">({active.length})</span></h2>
      <div className="mt-3 flex flex-col gap-3">{active.length ? active.map(row) : <p className="text-slate-500">No unfinished fixtures. Add your next match night below.</p>}</div>
    </section>

    <details className="card">
      <summary className="cursor-pointer font-semibold">Add fixture</summary>
      <div className="mt-3"><CreateFixtureForm seasons={uniqueSeasons} defaultSeasonId={seasonId ?? current?.id ?? ""} /></div>
    </details>

    {suggestion && upcoming && <details className="card">
      <summary className="cursor-pointer font-semibold">Suggested team for {upcoming.opponent}</summary>
      <p className="text-sm text-slate-500 mt-3">A suggestion based on recent form. Win your last match, or draw one of your last two, and keep your spot.</p>
      <ul className="mt-3 flex flex-col gap-2">{suggestion.picks.map(p => <li key={p.player_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2"><span className="font-semibold break-words">{p.name}</span><FormPills form={p.form} max={2} /></li>)}</ul>
      {suggestion.openSpots > 0 && <p className="mt-3 text-sm text-slate-500">{suggestion.openSpots} places available</p>}
    </details>}

    <details className="card" open={active.length === 0}>
      <summary className="cursor-pointer font-semibold">Results ({completed.length})</summary>
      <p className="text-sm text-slate-500 mt-3">{completed.filter(f => f.status === "win").length} wins · {completed.filter(f => f.status === "draw").length} draws · {completed.filter(f => f.status === "loss").length} losses</p>
      <div className="mt-3 flex flex-col gap-3">{completed.length ? completed.map(row) : <p className="text-sm text-slate-500">Results appear after all six matches finish.</p>}</div>
    </details>
  </main>;
}
