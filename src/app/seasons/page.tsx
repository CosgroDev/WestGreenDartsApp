import { getSeasons } from "@/data/seasons";
import { createSeasonAction, setCurrentSeasonAction } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export default async function SeasonsPage() {
  const seasons = await getSeasons();
  const uniqueSeasons = seasons.filter(
    (s, idx, arr) => arr.findIndex((t) => t.name.toLowerCase() === s.name.toLowerCase()) === idx
  );

  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <div className="mb-2">
          <Button variant="secondary" size="sm" asChild className="rounded-full">
            <a href="/fixtures" aria-label="Back to fixtures" title="Back to fixtures">←</a>
          </Button>
        </div>
        <p className="text-sm text-slate-600">Seasons</p>
        <h1 className="text-2xl font-semibold">Manage Seasons</h1>
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold mb-3">Add season</h2>
        <form action={createSeasonAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="name">Season name (YY/YY)</Label>
            <Input
              id="name"
              name="name"
              type="text"
              required
              pattern="^[0-9]{2}/[0-9]{2}$"
              placeholder="25/26"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <Checkbox name="is_current" />
            Set as current
          </label>
          <Button type="submit" className="self-start">
            Save season
          </Button>
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
                    <Button variant="outline" size="sm" type="submit">
                      Set current
                    </Button>
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
