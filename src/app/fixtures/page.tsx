import Link from "next/link";
import { getFixtures } from "@/data/fixtures";
import { getSeasons } from "@/data/seasons";
import { deleteFixtureAction } from "./actions";
import { CreateFixtureForm } from "./CreateFixtureForm";

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}

export default async function FixturesPage({
  searchParams
}: {
  searchParams?: { season?: string };
}) {
  const seasons = await getSeasons();
  // dedupe by name but keep id; pick first occurrence
  const uniqueSeasons = seasons.filter(
    (s, idx, arr) => arr.findIndex((t) => t.name === s.name) === idx
  );
  const uniqueSeasonNames = uniqueSeasons.map((s) => s.name);
  const defaultSeasonId =
    uniqueSeasons.find((s) => s.is_current)?.id ?? uniqueSeasons[0]?.id ?? "";

  const seasonFilterName =
    searchParams?.season && searchParams.season !== "all" ? searchParams.season : undefined;
  const defaultSeasonName =
    searchParams?.season || (uniqueSeasonNames.length ? uniqueSeasonNames[0] : "all");

  const fixturesAll = await getFixtures();
  const fixtures =
    seasonFilterName && seasonFilterName !== "all"
      ? fixturesAll.filter((f) => f.season === seasonFilterName)
      : fixturesAll;
  // derive record from the filtered fixtures (fixtures can draw, individual legs cannot)
  const completedGames = fixtures.flatMap((f) => f.games || []).filter((g) => g.status === "completed");
  const legWins = completedGames.filter((g) => g.winner === "west_green").length;
  const legLosses = completedGames.filter((g) => g.winner === "opponent").length;
  const legsFor = legWins;
  const legsAgainst = legLosses;
  const fixtureWins = fixtures.filter((f) => f.status === "win").length;
  const fixtureLosses = fixtures.filter((f) => f.status === "loss").length;
  const fixtureDraws = fixtures.filter((f) => f.status === "draw").length;

  // Next upcoming fixture (future-dated)
  const now = new Date();
  const upcoming = fixtures
    .filter((f) => new Date(f.starts_at) > now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())[0];

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <div className="mb-2 flex gap-2">
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
            aria-label="Back"
            title="Back"
          >
            ←
          </a>
          <a
            href="/seasons"
            className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
            aria-label="Seasons"
            title="Seasons"
          >
            📅
          </a>
        </div>
        <p className="text-sm text-slate-600">Season fixtures</p>
        <h1 className="text-2xl font-semibold">Fixtures</h1>
        <p className="text-slate-700 mt-2">
          Total fixtures: <span className="font-semibold">{fixtures.length}</span>
        </p>
        <form method="get" className="mt-2 flex items-center gap-2">
          <label className="text-sm text-slate-700" htmlFor="seasonFilter">
            Season
          </label>
          <select
            id="seasonFilter"
            name="season"
            defaultValue={defaultSeasonName}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="all">All seasons</option>
            {uniqueSeasonNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md bg-emerald-600 px-3 py-2 text-white text-sm font-semibold hover:bg-emerald-700"
          >
            Apply
          </button>
        </form>
        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-xs text-emerald-700 uppercase tracking-wide">Fixture wins</p>
            <p className="text-lg font-semibold text-emerald-900">{fixtureWins}</p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700 uppercase tracking-wide">Fixture draws</p>
            <p className="text-lg font-semibold text-amber-900">{fixtureDraws}</p>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-700 uppercase tracking-wide">Fixture losses</p>
            <p className="text-lg font-semibold text-red-900">{fixtureLosses}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-600 uppercase tracking-wide">+/− Legs</p>
            <p
              className={`text-lg font-semibold ${
                legsFor - legsAgainst > 0
                  ? "text-emerald-800"
                  : legsFor - legsAgainst < 0
                  ? "text-red-800"
                  : "text-slate-900"
              }`}
            >
              {legsFor - legsAgainst > 0 ? "+" : ""}
              {legsFor - legsAgainst}
            </p>
            <p className="text-xs text-slate-500">
              {legsFor} for / {legsAgainst} against
            </p>
          </div>
        </div>
      </header>

      {upcoming && (
        <section className="card">
          <div className="flex justify-between items-start">
            <div className="flex flex-col gap-1">
              <p className="text-sm text-slate-600">Next fixture</p>
              <h2 className="text-lg font-semibold">
                {upcoming.home ? "Home vs" : "Away @"} {upcoming.opponent}
              </h2>
              <p className="text-sm text-slate-700">{formatDate(upcoming.starts_at)}</p>
              {upcoming.venue && <p className="text-sm text-slate-600">{upcoming.venue}</p>}
            </div>
            <Link
              href={`/fixtures/${upcoming.id}`}
              className="inline-flex items-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Open fixture
            </Link>
          </div>
        </section>
      )}

      <details className="card">
        <summary className="text-lg font-semibold cursor-pointer select-none flex items-center gap-2">
          <span className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200">
            ☰
          </span>
          <span>Add fixture</span>
          <span className="text-xs font-normal text-slate-500">(click to show/hide)</span>
        </summary>
        <div className="mt-3">
          <CreateFixtureForm seasons={uniqueSeasons} defaultSeasonId={defaultSeasonId} />
        </div>
      </details>

      <details open className="card">
        <summary className="text-lg font-semibold cursor-pointer select-none">Fixture list (click to toggle)</summary>
        <div className="mt-3 flex flex-col gap-3">
          {fixtures.map((fixture) => (
            <div key={fixture.id} className="card hover:border-emerald-200 transition py-3">
              <div className="flex justify-between items-start gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">{fixture.season}</span>
                    <span className="rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs">
                      {fixture.home ? "Home" : "Away"}
                    </span>
                    {fixture.status && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          fixture.status === "win"
                            ? "bg-emerald-50 text-emerald-700"
                            : fixture.status === "loss"
                            ? "bg-red-50 text-red-700"
                            : fixture.status === "draw"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {fixture.status === "win"
                          ? "Win"
                          : fixture.status === "loss"
                          ? "Loss"
                          : fixture.status === "draw"
                          ? "Draw"
                          : "In progress"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">
                      {fixture.home ? "Home vs" : "Away @"} {fixture.opponent}
                    </h2>
                    <span className="text-sm text-slate-600">{formatDate(fixture.starts_at)}</span>
                  </div>
                  {fixture.venue && <p className="text-sm text-slate-600">{fixture.venue}</p>}
                  {fixture.notes && <p className="text-xs text-slate-500 line-clamp-2">{fixture.notes}</p>}
                </div>
                <div className="flex items-start gap-2">
                  <Link
                    href={`/fixtures/${fixture.id}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                    title="Open fixture"
                  >
                    ↗
                  </Link>
                  {fixture.games_count === 0 && (
                    <form action={deleteFixtureAction}>
                      <input type="hidden" name="fixtureId" value={fixture.id} />
                      <button
                        type="submit"
                        className="rounded-full border border-slate-300 w-7 h-7 flex items-center justify-center text-slate-500 hover:border-red-200 hover:text-red-600 text-xs"
                        title="Delete fixture (only if no games)"
                      >
                        x
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </details>
    </main>
  );
}
