"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Hash, LogOut, Menu, Moon, Search, Settings, Sun, Users, X } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { logoutAction, sendMessageAction } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Badge, Input, Textarea } from "@/components/ui/forms";
import { cn, formatDay, formatTime, initials, avatarColor } from "@/lib/utils";

type User = {
  id: string;
  username: string;
  displayName: string;
  isAdmin: boolean;
};

type Room = {
  id: string;
  name: string;
  description: string;
  roomType: string;
  unread: number;
  lastMessage: { content: string; createdAt: string } | null;
  onlineCount: number;
  currentTopic: { id: string; name: string } | null;
  activityState: string;
};

type Message = {
  id: string;
  content: string;
  createdAt: string;
  senderUserId: string | null;
  senderAiPersonaId: string | null;
  sender: {
    kind: string;
    displayName?: string;
    username?: string;
    isAi?: boolean;
    aiDisclosureLabel?: string;
    id?: string;
  };
};

type Participant = {
  kind: string;
  id: string;
  displayName: string;
  presence: string;
  isAi?: boolean;
};

export function ChatApp({
  user,
  rooms: initialRooms,
  initialRoomId,
  initialMessages = [],
  initialParticipants = [],
  initialTyping = [],
  sendError,
}: {
  user: User;
  rooms: Room[];
  initialRoomId?: string;
  initialMessages?: Message[];
  initialParticipants?: Participant[];
  initialTyping?: Array<{ actorId: string; displayName: string; isAi?: boolean }>;
  sendError?: string;
}) {
  const { theme, setTheme } = useTheme();
  const [rooms, setRooms] = useState<Room[]>(initialRooms);
  const roomId = initialRoomId ?? initialRooms[0]?.id ?? "";
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [typing, setTyping] = useState(initialTyping);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [info, setInfo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);

  useEffect(() => {
    setRooms(initialRooms);
    setMessages(initialMessages);
    setParticipants(initialParticipants);
    setTyping(initialTyping);
  }, [initialRoomId, initialRooms, initialMessages, initialParticipants, initialTyping]);

  useEffect(() => {
    if (sendError) toast.error(sendError);
  }, [sendError]);

  useEffect(() => {
    const beat = setInterval(() => {
      void fetch("/api/presence", { method: "POST" });
    }, 20000);
    return () => clearInterval(beat);
  }, []);

  useEffect(() => {
    if (!roomId) return;
    void fetch(`/api/rooms/${roomId}/read`, { method: "POST" });
    const es = new EventSource(`/api/realtime?roomId=${roomId}`);
    es.addEventListener("new_message", (ev) => {
      try {
        const payload = JSON.parse((ev as MessageEvent).data);
        setMessages((prev) => (prev.some((m) => m.id === payload.id) ? prev : [...prev, payload]));
      } catch {
        /* ignore */
      }
    });
    es.addEventListener("typing_start", (ev) => {
      const p = JSON.parse((ev as MessageEvent).data);
      setTyping((prev) => [...prev.filter((t) => t.actorId !== p.actorId), p]);
    });
    es.addEventListener("typing_stop", (ev) => {
      const p = JSON.parse((ev as MessageEvent).data);
      setTyping((prev) => prev.filter((t) => t.actorId !== p.actorId));
    });
    es.addEventListener("presence_update", (ev) => {
      try {
        const p = JSON.parse((ev as MessageEvent).data);
        if (typeof p.onlineCount === "number") {
          setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, onlineCount: p.onlineCount } : r)));
        }
      } catch {
        /* ignore */
      }
      void fetch("/api/rooms")
        .then((r) => r.json())
        .then((d) => setRooms(d.rooms ?? []));
    });
    return () => es.close();
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const room = rooms.find((r) => r.id === roomId);
  const filtered = rooms.filter((r) => r.name.toLowerCase().includes(query.toLowerCase()));
  const grouped = useMemo(() => {
    const days: { day: string; items: Message[] }[] = [];
    for (const m of messages) {
      const day = formatDay(m.createdAt);
      const last = days[days.length - 1];
      if (!last || last.day !== day) days.push({ day, items: [m] });
      else last.items.push(m);
    }
    return days;
  }, [messages]);

  async function send(e?: React.FormEvent<HTMLFormElement>) {
    const content = draft.trim();
    if (!content || !roomId) return;
    e?.preventDefault();
    setDraft("");
    const res = await fetch(`/api/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    const data = await res.json();
    if (!res.ok) toast.error(data.error || "Could not send");
    else if (data.message) setMessages((prev) => [...prev.filter((m) => m.id !== data.message.id), data.message]);
  }

  function onDraft(v: string) {
    setDraft(v);
    if (!roomId) return;
    void fetch(`/api/rooms/${roomId}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typing: true }),
    });
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => {
      void fetch(`/api/rooms/${roomId}/typing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typing: false }),
      });
    }, 1500);
  }

  async function report(messageId: string) {
    await fetch(`/api/rooms/${roomId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, reason: "user report" }),
    });
    toast.success("Reported to moderators");
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        className={cn(
          "absolute z-20 flex h-full w-[min(100%,320px)] flex-col border-r border-border bg-sidebar md:static md:w-[320px]",
          sidebar ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <div className="text-base font-semibold">Harbor</div>
            <div className="text-xs text-muted-foreground">@{user.username}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user.isAdmin ? (
              <Button variant="ghost" size="icon" asChild>
                <Link href="/admin">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebar(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search rooms" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-sm text-muted-foreground">No rooms match that search.</div>
          ) : (
            filtered.map((r) => (
              <Link
                key={r.id}
                href={`/rooms/${r.id}`}
                onClick={() => setSidebar(false)}
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/60",
                  r.id === roomId && "bg-muted",
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold">
                  <Hash className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium">{r.name}</div>
                    {r.unread > 0 ? (
                      <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-white">{r.unread}</span>
                    ) : null}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{r.lastMessage?.content || r.description}</div>
                </div>
              </Link>
            ))
          )}
        </div>
        <form action={logoutAction}>
          <button type="submit" className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-chat">
        <header className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
          <div className="flex items-center gap-3">
            <Button type="button" variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebar(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 font-semibold">
                {room?.name ?? "Select a room"}
                {room?.roomType === "private" ? <Badge>Private</Badge> : <Badge tone="ok">Public</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {room ? `${room.onlineCount} online` : "Join a conversation"}
              </div>
            </div>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => setInfo((v) => !v)}>
            <Users className="h-4 w-4" />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto px-3 py-4 scrollbar-thin md:px-8">
              {!room ? (
                <div className="py-20 text-center text-muted-foreground">Choose a room to start chatting.</div>
              ) : messages.length === 0 ? (
                <div className="mx-auto max-w-md rounded-2xl bg-card/80 p-6 text-center text-sm text-muted-foreground">
                  No messages yet. Say hello — people are around.
                </div>
              ) : (
                grouped.map((g) => (
                  <div key={g.day}>
                    <div className="mb-3 text-center text-[11px] text-muted-foreground">{g.day}</div>
                    <div className="space-y-2">
                      {g.items.map((m) => {
                        const mine = m.senderUserId === user.id;
                        const name = mine ? "You" : m.sender.displayName || "Member";
                        return (
                          <div key={m.id} className={cn("flex gap-2", mine ? "justify-end" : "justify-start")}>
                            {!mine ? (
                              <span
                                className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                                style={{ background: avatarColor(name) }}
                              >
                                {initials(name)}
                              </span>
                            ) : null}
                            <div
                              className={cn(
                                "max-w-[min(100%,520px)] rounded-2xl px-3 py-2 shadow-sm",
                                mine ? "bg-mine" : "bg-theirs",
                              )}
                            >
                              <div className="mb-0.5 flex items-center gap-2 text-[11px]">
                                <span className="font-semibold">{name}</span>
                                <span className="text-muted-foreground">{formatTime(m.createdAt)}</span>
                                <button type="button" className="text-muted-foreground hover:text-danger" onClick={() => report(m.id)}>
                                  Report
                                </button>
                              </div>
                              <div className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
              {typing.length > 0 ? (
                <div className="text-xs text-muted-foreground">
                  {typing
                    .slice(0, 2)
                    .map((t) => t.displayName)
                    .join(", ")}{" "}
                  typing…
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
            <form
              action={sendMessageAction}
              method="post"
              className="border-t border-border bg-card p-3"
              onSubmit={(e) => void send(e)}
            >
              <input type="hidden" name="roomId" value={roomId} />
              <div className="mx-auto flex max-w-3xl items-end gap-2">
                <Textarea
                  name="content"
                  rows={1}
                  placeholder="Message"
                  value={draft}
                  onChange={(e) => onDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button type="submit">Send</Button>
              </div>
            </form>
          </div>
          {info ? (
            <aside className="hidden w-72 overflow-y-auto border-l border-border bg-sidebar p-4 md:block">
              <div className="text-sm font-semibold">Room info</div>
              <p className="mt-2 text-sm text-muted-foreground">{room?.description}</p>
              <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Online — {room?.onlineCount ?? 0}
              </div>
              <ul className="mt-2 space-y-2">
                {participants.slice(0, 40).map((p) => (
                  <li key={`${p.kind}-${p.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                        style={{ background: avatarColor(p.displayName) }}
                      >
                        {initials(p.displayName)}
                      </span>
                      {p.displayName}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{p.presence}</span>
                  </li>
                ))}
              </ul>
              {participants.length > 40 ? (
                <p className="mt-2 text-xs text-muted-foreground">+{participants.length - 40} more in this room</p>
              ) : null}
            </aside>
          ) : null}
        </div>
      </section>
    </div>
  );
}
