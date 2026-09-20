import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { getRoomForUser, listMessages, participants, typingForRoom } from "@/lib/platform";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const room = getRoomForUser(id, auth.profile.id);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({
    room,
    messages: listMessages(id),
    participants: participants(id),
    typing: typingForRoom(id),
  });
}
