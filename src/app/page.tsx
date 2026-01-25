import Link from "next/link";
import Image from "next/image";

export default function HomePage() {
  return (
    <main className="flex flex-col gap-6">
      <header className="card">
        <div className="flex items-center gap-3">
          <Image src="/west_green_logo.png" alt="West Green Darts" width={82} height={82} className="brand-logo" />
          <div>
            <p className="text-sm text-slate-600">West Green Darts</p>
            <h1 className="text-2xl font-semibold">Team Control Room</h1>
          </div>
        </div>
        <p className="text-slate-700 mt-2">
          Manage seasons, fixtures, players, and live scoring from any device. Enter the shared team PIN to get started.
        </p>
        <Link
          href="/pin"
          className="mt-4 inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700"
        >
          Enter PIN
        </Link>
      </header>

      <section className="card">
        <h2 className="text-lg font-semibold">What&apos;s ready in this build</h2>
        <ul className="list-disc ml-5 text-slate-700 leading-relaxed">
          <li>Project scaffold with Next.js App Router and Tailwind.</li>
          <li>Supabase client wiring via environment variables.</li>
          <li>PIN gate page scaffold and protected dashboard shell.</li>
          <li>Initial Supabase schema in `supabase/schema.sql` aligned to the PRD.</li>
        </ul>
      </section>
    </main>
  );
}
