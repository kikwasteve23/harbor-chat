"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Hash,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Input, Textarea } from "@/components/ui/forms";
import { cn, formatDay, formatTime, initials } from "@/lib/utils";

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

export function ChatApp({ initialRoomId }: { initialRoomId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState(initialRoomId ?? "");
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<any[]>([]);
  const [typing, setTyping] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [info, setInfo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimer = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await fetch("/api/auth/me");
      if (me.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await me.json();
      if (cancelled) return;
      setUser(data.user);
      const roomsRes = await fetch("/api/rooms");
      const roomsJson = await roomsRes.json();
      setRooms(roomsJson.rooms ?? []);
      const first = initialRoomId || roomsJson.rooms?.[0]?.id;
      if (first) setRoomId(first);
      setLoading(false);
    })().catch((e) => {
      setError(e.message);
      setLoading(false);
    });
    const beat = setInterval(() => {
      void fetch("/api/presence", { method: "POST" });
    }, 20000);
    return () => {
      cancelled = true;
      clearInterval(beat);
    };
  }, [initialRoomId, router]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/rooms/${roomId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (cancelled) return;
      setMessages(data.messages ?? []);
      setParticipants(data.participants ?? []);
      setTyping(data.typing ?? []);
      await fetch(`/api/rooms/${roomId}/read`, { method: "POST" });
      if (pathname !== `/rooms/${roomId}`) router.replace(`/rooms/${roomId}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, pathname, router]);

  useEffect(() => {
    if (!roomId) return;
    const es = new EventSource(`/api/realtime?roomId=${roomId}`);
    const onMessage = (ev: MessageEvent) => {
      try {
        const payload = JSON.parse(ev.data);
        setMessages((prev) => (prev.some((m) => m.id === payload.id) ? prev : [...prev, payload]));
      } catch {
        /* ignore */
      }
    };
    es.addEventListener("new_message", onMessage);
    es.addEventListener("typing_start", (ev) => {
      const p = JSON.parse((ev as MessageEvent).data);
      setTyping((prev) => [...prev.filter((t) => t.actorId !== p.actorId), p]);
    });
    es.addEventListener("typing_stop", (ev) => {
      const p = JSON.parse((ev as MessageEvent).data);
      setTyping((prev) => prev.filter((t) => t.actorId !== p.actorId));
    });
    es.addEventListener("presence_update", () => {
      void fetch("/api/rooms")
        .then((r) => r.json())
        .then((d) => setRooms(d.rooms ?? []));
    });
    es.addEventListener("unread_count_update", () => {
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

  async function send() {
    const content = draft.trim();
    if (!content || !roomId) return;
    setDraft("");
    await fetch(`/api/rooms/${roomId}/typing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typing: false }),
    });
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

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function report(messageId: string) {
    await fetch(`/api/rooms/${roomId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, reason: "user report" }),
    });
    toast.success("Reported to moderators");
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">Opening Harbor…</div>
    );
  }
  if (error) {
    return <div className="flex h-screen items-center justify-center text-danger">{error}</div>;
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
            <div className="text-xs text-muted-foreground">@{user?.username}</div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            {user?.isAdmin ? (
              <Button variant="ghost" size="icon" asChild>
                <Link href="/admin">
                  <Settings className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebar(false)}>
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
              <button
                key={r.id}
                onClick={() => {
                  setRoomId(r.id);
                  setSidebar(false);
                }}
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
                  <div className="truncate text-xs text-muted-foreground">
                    {r.lastMessage?.content || r.description}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
        <button onClick={logout} className="flex items-center gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground hover:bg-muted">
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-chat">
        <header className="flex items-center justify-between border-b border-border bg-card px-3 py-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebar(true)}>
              <Menu className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 font-semibold">
                {room?.name ?? "Select a room"}
                {room?.roomType === "private" ? <Badge>Private</Badge> : <Badge tone="ok">Public</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {room ? `${room.onlineCount} online · ${room.activityState} · topic: ${room.currentTopic?.name ?? "none"}` : "Join a conversation"}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setInfo((v) => !v)}>
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
                  This room is quiet. Human messages are prioritized. AI participants may join later — they are always labeled AI.
                </div>
              ) : (
                grouped.map((g) => (
                  <div key={g.day}>
                    <div className="mb-3 text-center text-[11px] text-muted-foreground">{g.day}</div>
                    <div className="space-y-2">
                      {g.items.map((m) => {
                        const mine = m.senderUserId === user?.id;
                        const ai = m.sender.kind === "ai";
                        return (
                          <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                            <div className={cn("max-w-[min(100%,520px)] rounded-2xl px-3 py-2 shadow-sm", mine ? "bg-mine" : "bg-theirs")}>
                              <div className="mb-0.5 flex items-center gap-2 text-[11px]">
                                <span className="font-semibold">{mine ? "You" : m.sender.displayName}</span>
                                {ai ? <Badge tone="ai">{m.sender.aiDisclosureLabel || "AI"}</Badge> : null}
                                <span className="text-muted-foreground">{formatTime(m.createdAt)}</span>
                                <button className="text-muted-foreground hover:text-danger" onClick={() => report(m.id)}>
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
                    .map((t) => `${t.displayName}${t.isAi ? " (AI)" : ""}`)
                    .join(", ")}{" "}
                  typing…
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
            <form
              className="border-t border-border bg-card p-3"
              onSubmit={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              <div className="mx-auto flex max-w-3xl items-end gap-2">
                <Textarea
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
              <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Participants</div>
              <ul className="mt-2 space-y-2">
                {participants.map((p) => (
                  <li key={`${p.kind}-${p.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-[11px]">
                        {initials(p.displayName)}
                      </span>
                      {p.displayName}
                      {p.isAi ? <Badge tone="ai">AI</Badge> : null}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{p.presence}</span>
                  </li>
                ))}
              </ul>
            </aside>
          ) : null}
        </div>
      </section>
    </div>
  );
}
