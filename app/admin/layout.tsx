import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { getProfile } from "@/lib/platform";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  if (!session) redirect("/login");
  const profile = getProfile(session.userId);
  if (!profile?.isAdmin) redirect("/rooms");
  return children;
}
