import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "./session";

export async function requireSession() {
  if (!await verifySession((await cookies()).get("wgd_session")?.value)) redirect("/pin");
}
