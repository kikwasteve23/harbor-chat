import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { touchPresence } from "@/lib/platform";

export async function POST() {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  touchPresence(auth.profile.id);
  return NextResponse.json({ ok: true });
}
