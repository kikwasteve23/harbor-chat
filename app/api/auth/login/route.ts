import { NextResponse } from "next/server";
import { createSessionToken, publicProfile, setSessionCookie } from "@/lib/auth";
import { bootstrapIfNeeded } from "@/lib/bootstrap";
import { loginUser } from "@/lib/platform";

export async function POST(req: Request) {
  await bootstrapIfNeeded();
  try {
    const body = await req.json();
    const profile = await loginUser(String(body.email ?? ""), String(body.password ?? ""));
    const token = await createSessionToken(profile);
    await setSessionCookie(token);
    return NextResponse.json({ user: publicProfile(profile) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Login failed" }, { status: 400 });
  }
}
