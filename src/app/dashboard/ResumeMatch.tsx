import Link from "next/link";
import { supabaseServer } from "@/lib/supabaseServer";
export async function ResumeMatch({ fixtureId }: { fixtureId?: string } = {}) {
  const db = await supabaseServer();
  if (!db) return null;
  let query = db.from("games")
    .select("id, fixture_id, opponent_player, players(name), fixtures!inner(opponent, home, starts_at)")
    .eq("deleted", false).eq("status", "in_progress")
    .order("created_at", { ascending: false }).order("id").limit(1);
  if (fixtureId) query = query.eq("fixture_id", fixtureId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Could not load the live match. Please try again.");
  if (!data) return null;
  const game = data as any;
  return <section className="space-y-1" aria-label="Resume live match">
    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Match in progress</p>
    <h3 className="mt-1 text-lg font-bold">{game.players?.name ?? "West Green"} vs {game.opponent_player || "Opponent"}</h3>
    <p className="mt-1 text-sm text-slate-600">{game.fixtures?.opponent} · {new Date(game.fixtures?.starts_at).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short" })}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Link className="btn-primary" href={"/scoring?game=" + game.id + "&fixture=" + game.fixture_id + "&home=" + (game.fixtures?.home ? "1" : "0")}>Resume scoring</Link>
      <Link className="btn-secondary" href={"/fixtures/" + game.fixture_id}>View fixture</Link>
    </div>
  </section>;
}
