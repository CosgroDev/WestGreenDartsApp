import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { requireSession } from "./auth";
import { issueSession, SESSION_SECONDS } from "./session";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Only the PIN exchange uses this unauthenticated factory. All application
// reads/writes must use supabaseServer, which validates the signed session.
export function pinAuthClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false
    },
    global: {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`
      }
    }
  });
}

export async function supabaseServer() {
  await requireSession();
  return pinAuthClient();
}

export async function setSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set("wgd_session", await issueSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_SECONDS,
    path: "/"
  });
}
