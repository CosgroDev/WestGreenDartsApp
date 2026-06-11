import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabaseServer";
import DoublesGameClient from "../DoublesGameClient";

export const dynamic = "force-dynamic";

export default async function DoublesScoringPage({
  searchParams,
}: {
  searchParams: { session?: string };
}) {
  const sessionId = searchParams.session;
  if (!sessionId) return notFound();

  const supabase = supabaseServer();
  if (!supabase) return notFound();

  const { data } = await supabase
    .from("doubles_practice_sessions")
    .select("id")
    .eq("id", sessionId)
    .maybeSingle();

  if (!data) return notFound();

  return <DoublesGameClient sessionId={sessionId} />;
}
