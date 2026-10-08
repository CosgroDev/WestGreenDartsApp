"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function lockDeviceAction(): Promise<void> {
  (await cookies()).delete("wgd_session");
  redirect("/pin");
}
