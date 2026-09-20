import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-guard";
import { bootstrapIfNeeded } from "@/lib/bootstrap";
import { createRoom, listRoomsForUser } from "@/lib/platform";

export async function GET() {
  await bootstrapIfNeeded();
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ rooms: listRoomsForUser(auth.profile.id) });
}

export async function POST(req: Request) {
  await bootstrapIfNeeded();
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  if (!auth.profile.isAdmin) {
    return NextResponse.json({ error: "Only admins can create rooms" }, { status: 403 });
  }
  const body = await req.json();
  const room = createRoom({
    name: String(body.name ?? "Untitled"),
    description: String(body.description ?? ""),
    roomType: body.roomType === "private" ? "private" : "public",
    activityMode: body.activityMode === "quiet" || body.activityMode === "lively" ? body.activityMode : "adaptive",
    createdBy: auth.profile.id,
  });
  return NextResponse.json({ room });
}
