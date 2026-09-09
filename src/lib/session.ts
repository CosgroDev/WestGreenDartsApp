// Web Crypto keeps session verification usable in both middleware and Node.
export const SESSION_SECONDS = 30 * 24 * 60 * 60;
const encoder = new TextEncoder();
const secret = () => process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
const signingKey = async () => {
  const value = secret();
  if (!value) throw new Error("Session signing secret is not configured");
  return crypto.subtle.importKey("raw", encoder.encode(value), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
};
const context = () => `${process.env.TEAM_ID || ""}:${process.env.PIN_HASH || ""}`;
export async function issueSession(now = Date.now()): Promise<string> {
  const payload = `v1.${Math.floor(now / 1000) + SESSION_SECONDS}.${crypto.randomUUID()}`;
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), encoder.encode(`${payload}:${context()}`));
  return `${payload}.${Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, "0")).join("")}`;
}
export async function verifySession(token?: string, now = Date.now()): Promise<boolean> {
  if (!token || !secret()) return false;
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d+$/.test(parts[1]) || !/^[a-f0-9-]{36}$/.test(parts[2]) || !/^[a-f0-9]{64}$/.test(parts[3])) return false;
  const expires = Number(parts[1]);
  if (expires <= Math.floor(now / 1000) || expires > Math.floor(now / 1000) + SESSION_SECONDS) return false;
  try {
    const signature = Uint8Array.from(parts[3].match(/../g)!, b => parseInt(b, 16));
    return await crypto.subtle.verify("HMAC", await signingKey(), signature, encoder.encode(`${parts.slice(0, 3).join(".")}:${context()}`));
  } catch { return false; }
}
