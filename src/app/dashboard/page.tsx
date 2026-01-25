export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { getPlayerCards, getTeamCard } from "@/data/stats";
import { StatBar } from "@/components/StatBar";
import { ChartCard } from "./ChartCard";
import { ExportLinks } from "./ExportLinks";
import { getSeasons } from "@/data/seasons";
import { getFixtures } from "@/data/fixtures";

export default async function DashboardPage() {
  const [players, team, seasons, fixtures] = await Promise.all([
    getPlayerCards(),
    getTeamCard(),
    getSeasons(),
    getFixtures()
  ]);
  const currentSeasonId = seasons.find((s) => s.is_current)?.id ?? "";
  const playersBy3da = [...players].sort((a, b) => (b.three_dart_avg ?? 0) - (a.three_dart_avg ?? 0));
  const playersByFirst9 = [...players].sort((a, b) => (b.first_nine_avg ?? 0) - (a.first_nine_avg ?? 0));
  const playersBy26 = [...players].sort((a, b) => (b.twenty_six ?? 0) - (a.twenty_six ?? 0));
  const chartData = playersBy3da.slice(0, 6).map((p) => ({ label: p.name || "—", value: p.three_dart_avg ?? 0 }));
  const first9Data = playersByFirst9
    .slice(0, 6)
    .map((p) => ({ label: p.name || "—", value: p.first_nine_avg ?? 0 }));
  const t26Data = playersBy26.slice(0, 6).map((p) => ({ label: p.name || "—", value: p.twenty_six ?? 0 }));
  // TODO: enforce PIN session check with middleware/server action.
  return (
    <main className="flex flex-col gap-4">
      <header className="card">
        <p className="text-sm text-slate-600">Overview</p>
        <h1 className="text-2xl font-semibold">Team Dashboard</h1>
      </header>

      <section className="grid grid-cols-1 gap-3">
        <div className="card">
          <h2 className="text-lg font-semibold">Team snapshot</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-600">Legs (W/L)</p>
              <p className="text-xl font-semibold">
                {team.legs_won ?? 0} / {team.legs_played ? team.legs_played - (team.legs_won ?? 0) : 0}
              </p>
            </div>
            <div>
              <p className="text-slate-600">3DA</p>
              <p className="text-xl font-semibold">{team.three_dart_avg ? team.three_dart_avg.toFixed(1) : "–"}</p>
            </div>
            <div>
              <p className="text-slate-600">High finish</p>
              <p className="text-xl font-semibold">{team.high_finish ?? "–"}</p>
            </div>
          </div>
        </div>

        <div className="card grid grid-cols-2 gap-2">
          <Link
            href="/fixtures"
            className="rounded-md bg-emerald-600 px-4 py-3 text-center text-white font-semibold hover:bg-emerald-700"
          >
            Fixtures
          </Link>
          <Link
            href="/players"
            className="rounded-md bg-slate-200 px-4 py-3 text-center text-slate-800 font-semibold hover:bg-slate-300"
          >
            Players
          </Link>
        </div>
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Top players</h2>
        <div className="grid grid-cols-1 gap-2">
          {players.slice(0, 4).map((p) => (
            <div
              key={p.player_id}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-3 text-sm"
            >
              <div>
                <p className="font-semibold">{p.name}</p>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <StatBar label="3DA" value={p.three_dart_avg} max={80} />
                  <StatBar label="First 9" value={p.first_nine_avg} max={100} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-emerald-50 text-emerald-700 px-5 py-2 text-sm font-semibold">
                  Won {p.legs_won}
                </span>
                <span className="rounded-full bg-slate-100 text-slate-700 px-5 py-2 text-sm font-semibold">
                  Played {p.legs_played}
                </span>
                {(() => {
                  const diff = (p.legs_won ?? 0) - ((p.legs_played ?? 0) - (p.legs_won ?? 0));
                  const color =
                    diff > 0 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700";
                  const label = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : "0";
                  return (
                    <span className={`rounded-full px-5 py-2 text-sm font-semibold ${color}`}>
                      {label}
                    </span>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3">
        <ChartCard title="3-Dart Average (by player)" data={chartData} color="#2f8f6d" />
        <ChartCard title="First 9 Average (by player)" data={first9Data} color="#4fb18d" />
        <ChartCard title="26s Hit (by player)" data={t26Data} color="#8b5cf6" />
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold mb-2">Exports</h2>
        <ExportLinks seasons={seasons} fixtures={fixtures} currentSeasonId={currentSeasonId} />
      </section>
    </main>
  );
}
