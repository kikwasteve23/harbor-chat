import { NextResponse } from "next/server";
import { createSessionToken, publicProfile, setSessionCookie } from "@/lib/auth";
import { bootstrapIfNeeded } from "@/lib/bootstrap";
import { registerUser } from "@/lib/platform";

export async function POST(req: Request) {
  await bootstrapIfNeeded();
  try {
    const body = await req.json();
    const profile = await registerUser({
      email: String(body.email ?? ""),
      username: String(body.username ?? ""),
      displayName: String(body.displayName ?? body.username ?? ""),
      password: String(body.password ?? ""),
    });
    const token = await createSessionToken(profile);
    await setSessionCookie(token);
    return NextResponse.json({ user: publicProfile(profile) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Register failed" }, { status: 400 });
  }
}
