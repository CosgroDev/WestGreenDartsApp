/** Only allow same-origin app paths, preserving search parameters and hashes. */
export function safeLocalDestination(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return fallback;
  try {
    const parsed = new URL(value, "https://west-green.local");
    if (parsed.origin !== "https://west-green.local" || parsed.pathname === "/pin" || parsed.pathname.startsWith("/pin/")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch { return fallback; }
}
