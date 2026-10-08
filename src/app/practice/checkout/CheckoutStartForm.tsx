"use client";
import StartGameForm from "../StartGameForm";
import { startCheckoutGameAction } from "./actions";

export default function CheckoutStartForm({ players }: { players: { id: string; name: string }[] }) {
  return <StartGameForm action={startCheckoutGameAction} label="Start Random Checkout"><label className="flex min-w-0 flex-col gap-1 text-sm">Player<select name="playerId" required className="input w-full min-w-0"><option value="">Choose a player</option>{players.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label></StartGameForm>;
}
