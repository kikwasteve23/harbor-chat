"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, createSessionToken, publicProfile, setSessionCookie } from "@/lib/auth";
import { bootstrapIfNeeded } from "@/lib/bootstrap";
import { loginUser, postHumanMessage, registerUser } from "@/lib/platform";

export async function loginAction(formData: FormData) {
  await bootstrapIfNeeded();
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  try {
    const profile = await loginUser(email, password);
    await setSessionCookie(await createSessionToken(profile));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not sign in";
    redirect(`/login?error=${encodeURIComponent(msg)}`);
  }
  redirect("/rooms");
}

export async function registerAction(formData: FormData) {
  await bootstrapIfNeeded();
  try {
    const profile = await registerUser({
      email: String(formData.get("email") ?? ""),
      username: String(formData.get("username") ?? ""),
      displayName: String(formData.get("displayName") ?? ""),
      password: String(formData.get("password") ?? ""),
    });
    await setSessionCookie(await createSessionToken(profile));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not register";
    redirect(`/register?error=${encodeURIComponent(msg)}`);
  }
  redirect("/rooms");
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}

export async function sendMessageAction(formData: FormData) {
  const { readSession } = await import("@/lib/auth");
  const session = await readSession();
  if (!session) redirect("/login");
  const roomId = String(formData.get("roomId") ?? "");
  const content = String(formData.get("content") ?? "");
  if (!roomId || !content.trim()) redirect(roomId ? `/rooms/${roomId}` : "/rooms");
  try {
    await postHumanMessage(roomId, session.userId, { content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not send";
    redirect(`/rooms/${roomId}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/rooms/${roomId}`);
}

export type PublicUser = ReturnType<typeof publicProfile>;
