import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import DoublesGameClient from "../DoublesGameClient";

export const dynamic = "force-dynamic";

export default async function DoublesScoringPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const sessionId = (await searchParams).session;
  if (!sessionId) return notFound();

  const supabase = await supabaseServer();
  if (!supabase) return notFound();

  const { data } = await supabase
    .from("doubles_practice_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!data) return notFound();

  return <DoublesGameClient sessionId={sessionId} />;
}
