import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { bootstrapIfNeeded } from "@/lib/bootstrap";
import { getProfile, listRoomsForUser } from "@/lib/platform";

export default async function RoomsIndexPage() {
  await bootstrapIfNeeded();
  const session = await readSession();
  if (!session) redirect("/login");
  const profile = getProfile(session.userId);
  if (!profile) redirect("/login");
  const rooms = listRoomsForUser(profile.id);
  if (rooms[0]) redirect(`/rooms/${rooms[0].id}`);
  return (
    <main className="flex min-h-screen items-center justify-center p-8 text-muted-foreground">
      No rooms are available yet. Ask an administrator to create one.
    </main>
  );
}
