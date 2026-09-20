import { NextResponse } from "next/server";
import { publicProfile } from "@/lib/auth";
import { bootstrapIfNeeded } from "@/lib/bootstrap";
import { requireUser } from "@/lib/api-guard";
import { touchPresence } from "@/lib/platform";

export async function GET() {
  await bootstrapIfNeeded();
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  touchPresence(auth.profile.id);
  return NextResponse.json({ user: publicProfile(auth.profile) });
}
