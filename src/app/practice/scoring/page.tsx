import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import PracticeScoringClient from "../PracticeScoringClient";

export const dynamic = "force-dynamic";
export const revalidate = false;

async function getLatestGame(sessionId: string) {
  const supabase = supabaseServer();
  if (!supabase) return null;
  const { data } = await supabase
    .from("practice_games")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "in_progress")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export default async function PracticeScoringPage({ searchParams }: { searchParams: { session?: string; game?: string } }) {
  const sessionId = searchParams.session;
  let gameId = searchParams.game;
  if (!sessionId) return notFound();
  if (!gameId) {
    gameId = await getLatestGame(sessionId);
    if (!gameId) return notFound();
    redirect(`/practice/scoring?session=${sessionId}&game=${gameId}`);
  }
  return <PracticeScoringClient />;
}
