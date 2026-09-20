import { ChatApp } from "@/components/chat-app";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ChatApp initialRoomId={id} />;
}
