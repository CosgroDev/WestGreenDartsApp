import Link from "next/link";
import { getPlayers } from "@/data/players";
import { getPracticePlayerStats } from "@/data/practice";
import { getSavedPractice, type PracticeMode } from "@/data/practiceHistory";
import SavedSessions from "./SavedSessions";
import X01StartForm from "./X01StartForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;
const modes: { id: PracticeMode; name: string; href: string; description: string }[] = [
  { id: "x01", name: "X01", href: "#x01", description: "301, 501 or 701 · Solo or two players · Double out" },
  { id: "121", name: "121 Challenge", href: "/practice/121", description: "Solo · Work from 121 to 170 in three visits per target" },
  { id: "doubles", name: "Doubles Switch", href: "/practice/doubles", description: "Solo or group · Rotate through doubles, then random targets" },
  { id: "checkout", name: "Random Checkout", href: "/practice/checkout", description: "Solo · Finish a random target in up to three darts" },
];

export default async function PracticePage() {
  const [roster, stats, ...saved] = await Promise.allSettled([getPlayers(), getPracticePlayerStats(), ...modes.map(m => getSavedPractice(m.id))]);
  const players = roster.status === "fulfilled" ? roster.value as Awaited<ReturnType<typeof getPlayers>> : [];
  const practiceStats = stats.status === "fulfilled" ? stats.value as Awaited<ReturnType<typeof getPracticePlayerStats>> : [];
  const sessions = saved.flatMap(result => result.status === "fulfilled" ? result.value as Awaited<ReturnType<typeof getSavedPractice>> : []);
  const errors = saved.flatMap((result, index) => result.status === "rejected" ? [modes[index].name] : []);
  return <main className="flex flex-col gap-5">
    <header><p className="text-sm text-slate-600">Choose, continue and improve</p><h1 className="text-2xl font-bold">Practice</h1></header>
    <SavedSessions sessions={sessions} players={players} errors={errors} kind="active" />
    <section className="card"><h2 className="mb-3 text-lg font-semibold">Choose a game</h2><div className="grid gap-2 sm:grid-cols-2">
      {modes.map(mode => <Link key={mode.id} href={mode.href} className="flex min-w-0 flex-col gap-1 rounded-lg border border-slate-200 p-4"><strong>{mode.name} →</strong><span className="text-sm text-slate-600">{mode.description}</span></Link>)}
    </div><h3 className="mb-2 mt-4 font-semibold">Pub games</h3><Link href="/pub-games/killer" className="flex flex-col gap-1 rounded-lg border border-slate-200 p-4"><strong>Killer →</strong><span className="text-sm text-slate-600">Group elimination game · Saved on this device only</span></Link></section>
    <section className="card scroll-mt-24" id="x01"><h2 className="mb-3 text-lg font-semibold">Start X01</h2>
      {roster.status === "rejected" ? <p role="alert">The roster could not be loaded. <Link href="/practice" className="underline">Retry loading</Link> before starting.</p> : <X01StartForm players={players.filter(p => p.active)} />}
    </section>
    <SavedSessions sessions={sessions} players={players} errors={errors} kind="results" />
    <details className="card"><summary className="cursor-pointer font-semibold">X01 player records</summary>
      {stats.status === "rejected" ? <p role="alert" className="mt-3 text-sm">Player records could not be loaded. <Link href="/practice" className="underline">Retry</Link></p> : !practiceStats.length ? <p className="mt-3 text-sm text-slate-600">Complete a team-player leg to start building practice records.</p> : <ul className="mt-3 divide-y divide-slate-200">{practiceStats.map(p => <li key={p.player_id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words font-semibold">{p.name}</span><span>{p.legs_won}/{p.legs_played} legs won · 3DA {p.three_dart_avg?.toFixed(1) ?? "–"} · First 9 {p.first_nine_avg?.toFixed(1) ?? "–"}{p.high_finish ? ` · High finish ${p.high_finish}` : ""}{p.one_eighty ? ` · ${p.one_eighty} × 180` : ""}{p.twenty_six ? ` · ${p.twenty_six} × 26` : ""}</span></li>)}</ul>}
    </details>
  </main>;
}
