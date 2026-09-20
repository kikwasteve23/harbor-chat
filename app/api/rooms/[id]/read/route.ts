import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { markRead } from "@/lib/platform";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  markRead(id, auth.profile.id);
  return NextResponse.json({ ok: true });
}
