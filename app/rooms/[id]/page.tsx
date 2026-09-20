import { redirect } from "next/navigation";
import { publicProfile, readSession } from "@/lib/auth";
import { bootstrapIfNeeded } from "@/lib/bootstrap";
import { getProfile, getRoomForUser, listMessages, listRoomsForUser, participants, typingForRoom } from "@/lib/platform";
import { ChatApp } from "@/components/chat-app";

export default async function RoomPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await bootstrapIfNeeded();
  const session = await readSession();
  if (!session) redirect("/login");
  const profile = getProfile(session.userId);
  if (!profile) redirect("/login");
  const { id } = await params;
  const { error } = await searchParams;
  const room = getRoomForUser(id, profile.id);
  if (!room) redirect("/rooms");
  return (
    <ChatApp
      user={publicProfile(profile)}
      rooms={listRoomsForUser(profile.id)}
      initialRoomId={id}
      initialMessages={listMessages(id)}
      initialParticipants={participants(id)}
      initialTyping={typingForRoom(id)}
      sendError={error}
    />
  );
}
