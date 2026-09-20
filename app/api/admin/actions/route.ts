import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { moderateUser, runOrchestration, simulationSnapshot } from "@/lib/platform";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const body = await req.json();
  if (body.action === "moderate") {
    moderateUser({
      actorId: auth.profile.id,
      targetId: String(body.targetId),
      action: body.moderateAction,
      reason: String(body.reason ?? ""),
      roomId: body.roomId,
    });
    return NextResponse.json({ ok: true });
  }
  if (body.action === "simulate") {
    const roomId = String(body.roomId);
    const decision = await runOrchestration(roomId, "simulation");
    return NextResponse.json({ decision, snapshot: simulationSnapshot(roomId) });
  }
  if (body.action === "snapshot") {
    return NextResponse.json(simulationSnapshot(String(body.roomId)));
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
