import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { reportMessage } from "@/lib/platform";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const body = await req.json();
  reportMessage({
    roomId: id,
    messageId: String(body.messageId ?? ""),
    reporterUserId: auth.profile.id,
    reason: String(body.reason ?? "unspecified"),
  });
  return NextResponse.json({ ok: true });
}
