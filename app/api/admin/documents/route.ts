import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-guard";
import { ingestDocument } from "@/lib/platform";

export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const doc = await ingestDocument({
      filename: file.name,
      mime: file.type,
      buffer: buf,
      uploadedBy: auth.profile.id,
    });
    return NextResponse.json({ document: doc });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ingest failed" }, { status: 400 });
  }
}
