"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { setSessionCookie, supabaseServer } from "@/lib/supabaseServer";

const PIN_SALT = process.env.PIN_SALT || "wgd-salt";
const PIN_HASH = process.env.PIN_HASH;

function hashPin(pin: string) {
  return crypto.createHash("sha256").update(`${PIN_SALT}:${pin}`).digest("hex");
}

export async function enterPinAction(formData: FormData) {
  const pin = (formData.get("pin") as string | null)?.trim();
  if (!pin) {
    return { ok: false, message: "PIN required" };
  }

  // Preferred path: call Supabase RPC for PIN auth.
  const supabase = supabaseServer();
  if (supabase) {
    const { data, error } = await supabase.rpc("auth_pin", { pin_input: pin }).single();
    if (!error && data?.token) {
      setSessionCookie(data.token);
      revalidatePath("/");
      return { ok: true };
    }
    // fall through to hash-based fallback if RPC missing or fails
  }

  // Fallback: local hash match for early dev.
  if (!PIN_HASH) {
    return { ok: false, message: "Server PIN hash is not configured" };
  }
  const candidate = hashPin(pin);
  if (candidate !== PIN_HASH) {
    return { ok: false, message: "Incorrect PIN" };
  }

  setSessionCookie(candidate);
  revalidatePath("/");
  return { ok: true };
}
