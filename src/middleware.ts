import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { verifySession } from "./lib/session";

const PUBLIC_PATHS = ["/", "/pin", "/api/health"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  if (isPublic || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const hasSession = await verifySession(request.cookies.get("wgd_session")?.value);
  if (!hasSession) {
    const url = new URL("/pin", request.url);
    url.searchParams.set("redirect", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|west_green_logo.png).*)"]
};
