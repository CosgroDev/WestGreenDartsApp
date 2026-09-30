import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { InsightsView } from "./InsightsView";
export const dynamic = "force-dynamic";
export default async function LeagueInsightsPage() {
  await requireSession();
  return <main className="flex flex-col gap-4 fade-up">
    <header><Link href="/dashboard" className="text-sm text-emerald-800 underline">← Dashboard</Link>
      <h1 className="mt-3 text-2xl font-bold">League insights</h1>
      <p className="mt-1 text-sm text-slate-600">West Green against the rest of the league</p></header>
    <InsightsView />
  </main>;
}
