import { getSeasons } from "@/data/seasons";
import { createSeasonAction, setCurrentSeasonAction } from "./actions";

export default async function SeasonsPage() {
  const seasons = await getSeasons();
  const uniqueSeasons = seasons.filter(
    (s, idx, arr) => arr.findIndex((t) => t.name.toLowerCase() === s.name.toLowerCase()) === idx
  );

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <div className="mb-2">
          <a
            href="/fixtures"
            className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
            aria-label="Back to fixtures"
            title="Back to fixtures"
          >
            ←
          </a>
        </div>
        <p className="text-sm text-slate-600">Seasons</p>
        <h1 className="text-2xl font-semibold">Manage Seasons</h1>
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Add season</h2>
        <form action={createSeasonAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-slate-700" htmlFor="name">
              Season name (YY/YY)
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              pattern="^[0-9]{2}/[0-9]{2}$"
              className="rounded-md border border-slate-300 px-3 py-2"
              placeholder="25/26"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="is_current" className="h-4 w-4" />
            Set as current
          </label>
          <button
            type="submit"
            className="self-start rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700"
          >
            Save season
          </button>
        </form>
      </section>

      <section className="card">
        {!uniqueSeasons.length ? (
          <p className="text-sm text-slate-600">No seasons yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {uniqueSeasons.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
              >
                <div>
                  <p className="font-semibold">{s.name}</p>
                  {s.is_current && <p className="text-sm text-emerald-700">Current</p>}
                </div>
                {!s.is_current && (
                  <form
                    action={async () => {
                      "use server";
                      await setCurrentSeasonAction(s.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-md border border-slate-300 px-3 py-1 text-sm font-semibold hover:border-emerald-200"
                    >
                      Set current
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
