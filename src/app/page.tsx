import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default function HomePage() {
  // Already unlocked devices go straight to the dashboard.
  if (cookies().get("wgd_session")?.value) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-[80vh] flex-col items-center justify-center gap-8 text-center fade-up">
      <div className="flex flex-col items-center gap-4">
        <Image
          src="/west_green_logo.png"
          alt="West Green Darts"
          width={132}
          height={132}
          className="brand-logo"
          priority
        />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-700">Team HQ</p>
          <h1 className="mt-1 text-4xl font-extrabold tracking-tight">West Green Darts</h1>
          <p className="mt-3 max-w-sm text-slate-600">
            Live 501 scoring, fixtures, stats and bragging rights — one shared PIN for the whole team.
          </p>
        </div>
      </div>

      <Link href="/pin" className="btn-primary px-10 py-4 text-lg">
        Enter team PIN
      </Link>

      <div className="grid w-full max-w-sm grid-cols-3 gap-2 text-xs text-slate-500">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
          <p className="text-lg">🎯</p>
          <p className="mt-1 font-semibold text-slate-700">Live scoring</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
          <p className="text-lg">📈</p>
          <p className="mt-1 font-semibold text-slate-700">Auto stats</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-3">
          <p className="text-lg">🏆</p>
          <p className="mt-1 font-semibold text-slate-700">Leaderboards</p>
        </div>
      </div>
    </main>
  );
}
