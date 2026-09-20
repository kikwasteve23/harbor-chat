import { NextResponse } from "next/server";

export async function GET() {
  const info: Record<string, unknown> = {
    ok: true,
    backend: process.env.DATABASE_URL ? "postgres" : "local",
  };
  if (process.env.DATABASE_URL) {
    try {
      const { postgresHealth } = await import("@/lib/db/postgres");
      info.database = (await postgresHealth()) ? "up" : "down";
    } catch (e) {
      info.ok = false;
      info.database = "error";
      info.error = e instanceof Error ? e.message : "db error";
      return NextResponse.json(info, { status: 503 });
    }
  }
  return NextResponse.json(info);
}
