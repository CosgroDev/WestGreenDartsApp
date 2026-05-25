import Link from "next/link";
import { getSeasons } from "@/data/seasons";
import { setCurrentSeasonAction } from "@/app/seasons/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SettingsPage() {
  const seasons = await getSeasons();
  const uniqueSeasons = seasons.filter(
    (s, idx, arr) => arr.findIndex((t) => t.name.toLowerCase() === s.name.toLowerCase()) === idx
  );

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <div className="mb-2">
          <a
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-full bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
            aria-label="Back to dashboard"
          >
            ←
          </a>
        </div>
        <p className="text-sm text-slate-600">App</p>
        <h1 className="text-2xl font-semibold">Settings</h1>
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold mb-1">Active season</h2>
        <p className="text-sm text-slate-600 mb-4">
          The active season filters the dashboard stats and is the default selection across the app.
        </p>

        {!uniqueSeasons.length ? (
          <div>
            <p className="text-sm text-slate-600 mb-3">No seasons found.</p>
            <Link href="/seasons" className="text-sm text-emerald-700 font-semibold hover:underline">
              Add a season →
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {uniqueSeasons.map((s) => {
              const setAction = setCurrentSeasonAction.bind(null, s.id);
              return (
                <div
                  key={s.id}
                  className={`flex items-center justify-between rounded-md border px-4 py-3 ${
                    s.is_current
                      ? "border-emerald-300 bg-emerald-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    {s.is_current && (
                      <p className="text-sm text-emerald-700 font-medium">Active</p>
                    )}
                  </div>
                  {s.is_current ? (
                    <span className="rounded-full bg-emerald-100 text-emerald-800 px-3 py-1 text-xs font-semibold">
                      Active
                    </span>
                  ) : (
                    <form action={setAction}>
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800"
                      >
                        Set active
                      </button>
                    </form>
                  )}
                </div>
              );
            })}

            <div className="mt-2 pt-2 border-t border-slate-100">
              <Link href="/seasons" className="text-sm text-emerald-700 font-semibold hover:underline">
                Manage seasons (add / remove) →
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
