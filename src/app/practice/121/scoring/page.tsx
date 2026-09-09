import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import Game121Client from "../Game121Client";

export const dynamic = "force-dynamic";

export default async function Game121ScoringPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const sessionId = (await searchParams).session;
  if (!sessionId) return notFound();

  const supabase = await supabaseServer();
  if (!supabase) return notFound();

  const { data } = await supabase
    .from("game_121_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!data) return notFound();

  return <Game121Client sessionId={sessionId} />;
}
