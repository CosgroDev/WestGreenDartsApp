import Link from "next/link";
import { getPlayers } from "@/data/players";
import { getCheckoutPlayerStats } from "@/data/checkoutPractice";
import { getSavedPractice } from "@/data/practiceHistory";
import SavedSessions from "../SavedSessions";
import CheckoutStartForm from "./CheckoutStartForm";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckoutPage() {
  const [roster, records, saved] = await Promise.allSettled([getPlayers(), getCheckoutPlayerStats(), getSavedPractice("checkout")]);
  const players = roster.status === "fulfilled" ? roster.value : [];
  const stats = records.status === "fulfilled" ? records.value : [];
  const sessions = saved.status === "fulfilled" ? saved.value : [];
  return <main className="flex flex-col gap-4">
    <header><Link href="/practice" className="btn btn-secondary mb-3">← Practice</Link><h1 className="text-2xl font-bold">Random Checkout</h1><p className="mt-1 text-sm text-slate-600">Solo training · Finish a random 2–170 target in up to three darts.</p></header>
    <SavedSessions sessions={sessions} players={players} errors={saved.status === "rejected" ? ["Random Checkout"] : []} modeFilter={false} retryHref="/practice/checkout" kind="active" />
    <section className="card"><h2 className="mb-3 text-lg font-semibold">Start a game</h2>{roster.status === "rejected" ? <p role="alert">The roster could not be loaded. <Link href="/practice/checkout" className="underline">Retry</Link></p> : <CheckoutStartForm players={players.filter(p => p.active)} />}</section>
    <details className="card"><summary className="cursor-pointer font-semibold">How to play</summary><div className="mt-3 flex flex-col gap-3 text-sm text-slate-600"><p>Each turn gives you a random finishable checkout and a suggested route.</p><p>Throw up to three darts. Record the number of darts used to finish on a double or Bull, or choose “Didn&apos;t finish”. A new target follows each attempt.</p><p>Pause to continue later, or end the session to see your results.</p></div></details>
    <SavedSessions sessions={sessions} players={players} modeFilter={false} retryHref="/practice/checkout" kind="results" />
    <details className="card"><summary className="cursor-pointer font-semibold">Player records</summary>{records.status === "rejected" ? <p role="alert" className="mt-3">Records could not be loaded. <Link href="/practice/checkout" className="underline">Retry</Link></p> : stats.length ? <ul className="mt-3 divide-y divide-slate-200">{stats.map(p => <li key={p.player_id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span className="min-w-0 break-words"><strong>{p.name}</strong><span className="block text-slate-600">{p.checkouts}/{p.attempts} finished · Average darts {p.avg_darts ?? "–"}</span></span><span>{p.checkout_pct ?? "–"}% checkout rate</span></li>)}</ul> : <p className="mt-3 text-sm text-slate-600">No attempts recorded yet.</p>}</details>
  </main>;
}
