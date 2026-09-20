import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { adminOverview, exportAdminCollections, updateSettings } from "@/lib/platform";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ overview: adminOverview(), ...exportAdminCollections() });
}

export async function PATCH(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json();
  const settings = updateSettings(body, auth.profile.id);
  return NextResponse.json({ settings });
}
