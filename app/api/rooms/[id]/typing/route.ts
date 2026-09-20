import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { setHumanTyping } from "@/lib/platform";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await req.json();
  setHumanTyping(id, auth.profile.id, Boolean(body.typing));
  return NextResponse.json({ ok: true });
}
