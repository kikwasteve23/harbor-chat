import { requireUser } from "@/lib/api-guard";
import { encodeSse, subscribe, type RealtimeEvent } from "@/lib/realtime";
import { touchPresence } from "@/lib/platform";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("error" in auth) return auth.error;
  const url = new URL(req.url);
  const roomId = url.searchParams.get("roomId");
  touchPresence(auth.profile.id);

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: RealtimeEvent) => {
        if (roomId && event.roomId !== roomId && event.type !== "unread_count_update") return;
        controller.enqueue(new TextEncoder().encode(encodeSse(event)));
      };
      const unsub = subscribe(send);
      const ping = setInterval(() => {
        controller.enqueue(new TextEncoder().encode(`event: ping\ndata: {}\n\n`));
      }, 15000);
      req.signal.addEventListener("abort", () => {
        clearInterval(ping);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
