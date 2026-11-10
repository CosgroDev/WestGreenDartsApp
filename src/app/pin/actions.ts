"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { lockMessage, pinFailed, pinLockSeconds, pinSucceeded } from "@/lib/pinLimiter";
import { setSessionCookie, pinAuthClient } from "@/lib/supabaseServer";

const PIN_SALT = process.env.PIN_SALT || "wgd-salt";
const PIN_HASH = process.env.PIN_HASH;

function hashPin(pin: string) {
  return crypto.createHash("sha256").update(`${PIN_SALT}:${pin}`).digest("hex");
}

// The limiter is keyed by a hash of the client address, so no address is stored.
// On Vercel the platform sets these headers; a client cannot choose them.
async function clientKey() {
  const h = await headers();
  const address = h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return crypto.createHash("sha256").update(`${PIN_SALT}:client:${address}`).digest("hex");
}

export async function enterPinAction(formData: FormData) {
  const pin = (formData.get("pin") as string | null)?.trim();
  if (!pin || !/^\d{1,8}$/.test(pin)) {
    return { ok: false, message: "PIN required" };
  }
  if (!PIN_HASH || !/^[a-f0-9]{64}$/i.test(PIN_HASH)) {
    return { ok: false, message: "Server PIN hash is not configured" };
  }

  const db = pinAuthClient();
  const key = await clientKey();
  const locked = await pinLockSeconds(db, key);
  if (locked > 0) return { ok: false, message: lockMessage(locked) };

  const candidate = hashPin(pin);
  if (!crypto.timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(PIN_HASH, "hex"))) {
    const wait = await pinFailed(db, key);
    return { ok: false, message: wait > 0 ? lockMessage(wait) : "Incorrect PIN" };
  }

  await pinSucceeded(db, key);
  await setSessionCookie();
  revalidatePath("/");
  return { ok: true };
}

/** Lock this device. Sessions are per-device signed cookies, so other devices stay unlocked. */
export async function signOutAction(): Promise<void> {
  (await cookies()).delete("wgd_session");
  redirect("/pin");
}
