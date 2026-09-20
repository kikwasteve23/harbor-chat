import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { getProfile } from "@/lib/platform";

export async function requireUser() {
  const session = await readSession();
  if (!session) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const profile = getProfile(session.userId);
  if (!profile || profile.bannedAt) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { profile };
}

export async function requireAdmin() {
  const result = await requireUser();
  if ("error" in result) return result;
  if (!result.profile.isAdmin) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}
