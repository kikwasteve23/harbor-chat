import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { listMessages, postHumanMessage } from "@/lib/platform";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  return NextResponse.json({ messages: listMessages(id) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const message = await postHumanMessage(id, auth.profile.id, body);
    return NextResponse.json({ message });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
