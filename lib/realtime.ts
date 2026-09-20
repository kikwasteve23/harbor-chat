type Handler = (event: RealtimeEvent) => void;

export type RealtimeEvent =
  | { type: "new_message"; roomId: string; payload: unknown }
  | { type: "typing_start"; roomId: string; payload: unknown }
  | { type: "typing_stop"; roomId: string; payload: unknown }
  | { type: "presence_update"; roomId: string; payload: unknown }
  | { type: "room_activity_update"; roomId: string; payload: unknown }
  | { type: "unread_count_update"; roomId: string; payload: unknown }
  | { type: "bot_event"; roomId: string; payload: unknown };

const listeners = new Set<Handler>();

export function subscribe(handler: Handler) {
  listeners.add(handler);
  return () => {
    listeners.delete(handler);
  };
}

export function publish(event: RealtimeEvent) {
  for (const handler of listeners) {
    try {
      handler(event);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

export function encodeSse(event: RealtimeEvent) {
  return `event: ${event.type}\ndata: ${JSON.stringify({ roomId: event.roomId, ...((event.payload as object) ?? {}) })}\n\n`;
}
