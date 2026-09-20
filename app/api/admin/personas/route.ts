import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { importPersonasFromBuffer } from "@/lib/platform";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const form = await req.formData();
  const file = form.get("file");
  const confirmed = String(form.get("confirmed") ?? "") === "true";
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const result = await importPersonasFromBuffer(buf, auth.profile.id, confirmed);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 400 });
  }
}
