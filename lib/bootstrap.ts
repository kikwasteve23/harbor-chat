import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "./auth";
import { expandLiveCommunity, ingestDocument, importPersonasFromBuffer } from "./platform";
import { mutateStore, loadStore, initStore } from "./store";
import { nowIso } from "./utils";

function id() {
  return crypto.randomUUID();
}

export async function bootstrapIfNeeded() {
  await initStore();
  const s = loadStore();
  if (!(s.seeded && s.profiles.length > 0)) {
    const adminEmail = process.env.DEMO_ADMIN_EMAIL || "admin@harbor.local";
    const adminPass = process.env.DEMO_ADMIN_PASSWORD || "admin-dev-only";
    const demoEmail = process.env.DEMO_USER_EMAIL || "demo@harbor.local";
    const demoPass = process.env.DEMO_USER_PASSWORD || "demo-dev-only";

    const adminHash = await hashPassword(adminPass);
    const demoHash = await hashPassword(demoPass);
    const now = nowIso();
    const adminId = id();
    const demoId = id();
    const loungeId = id();
    const qaId = id();
    const mentorsId = id();

    mutateStore((st) => {
      st.profiles.push(
        {
          id: adminId,
          username: "admin",
          displayName: "Maya Chen",
          email: adminEmail,
          passwordHash: adminHash,
          avatarUrl: null,
          bio: "Community lead.",
          isAdmin: true,
          createdAt: now,
          lastSeenAt: now,
          mutedUntil: null,
          bannedAt: null,
          banReason: null,
        },
        {
          id: demoId,
          username: "demo",
          displayName: "Jordan Blake",
          email: demoEmail,
          passwordHash: demoHash,
          avatarUrl: null,
          bio: "",
          isAdmin: false,
          createdAt: now,
          lastSeenAt: now,
          mutedUntil: null,
          bannedAt: null,
          banReason: null,
        },
      );
      st.rooms.push(
        {
          id: loungeId,
          name: "Welcome Lounge",
          description: "Hang out, say hi, and ask anything about getting started.",
          roomType: "public",
          isActive: true,
          activityMode: "adaptive",
          createdAt: now,
          createdBy: adminId,
        },
        {
          id: qaId,
          name: "Product Q&A",
          description: "How rooms, invites, and features actually work.",
          roomType: "public",
          isActive: true,
          activityMode: "adaptive",
          createdAt: now,
          createdBy: adminId,
        },
        {
          id: mentorsId,
          name: "Mentors",
          description: "Quieter room for longer how-to threads.",
          roomType: "private",
          isActive: true,
          activityMode: "quiet",
          createdAt: now,
          createdBy: adminId,
        },
      );
      for (const roomId of [loungeId, qaId, mentorsId]) {
        for (const userId of [adminId, demoId]) {
          st.members.push({
            roomId,
            userId,
            role: userId === adminId ? "admin" : "member",
            joinedAt: now,
            lastReadAt: now,
          });
        }
      }
      st.seeded = true;
    });

    const excelPath = path.join(process.cwd(), "seed", "personas.xlsx");
    if (fs.existsSync(excelPath)) {
      await importPersonasFromBuffer(fs.readFileSync(excelPath), adminId, true);
    }

    const docPath = path.join(process.cwd(), "seed", "harbor-platform-guide.md");
    if (fs.existsSync(docPath)) {
      await ingestDocument({
        filename: "harbor-platform-guide.md",
        mime: "text/markdown",
        buffer: fs.readFileSync(docPath),
        uploadedBy: adminId,
      });
    }

    mutateStore((st) => {
      const topic = st.topics.find((t) => t.active);
      for (const conv of st.conversation) {
        if (!conv.currentTopicId && topic) {
          conv.currentTopicId = topic.id;
          conv.topicHistory = [topic.id];
          conv.topicStartedAt = nowIso();
        }
        conv.displayedOnlineCount = 70 + Math.floor(Math.random() * 28);
      }
    });

    const store = loadStore();
    const lounge = store.rooms.find((r) => r.name === "Welcome Lounge");
    const p = store.aiPersonas;
    if (lounge && p[0] && p[1] && p[2]) {
      mutateStore((st) => {
        st.messages.push(
          {
            id: id(),
            roomId: lounge.id,
            senderUserId: demoId,
            senderAiPersonaId: null,
            content: "hey, just joined — is this the main room?",
            messageType: "text",
            replyToMessageId: null,
            createdAt: new Date(Date.now() - 3600_000).toISOString(),
            metadata: { seed: true },
          },
          {
            id: id(),
            roomId: lounge.id,
            senderUserId: null,
            senderAiPersonaId: p[0]!.id,
            content: "yeah this is the lounge. product questions usually go in Q&A but you can ask here too.",
            messageType: "text",
            replyToMessageId: null,
            createdAt: new Date(Date.now() - 3480_000).toISOString(),
            metadata: { seed: true },
          },
          {
            id: id(),
            roomId: lounge.id,
            senderUserId: adminId,
            senderAiPersonaId: null,
            content: "Welcome in. Mentors is invite-only if you want a slower thread.",
            messageType: "text",
            replyToMessageId: null,
            createdAt: new Date(Date.now() - 3300_000).toISOString(),
            metadata: { seed: true },
          },
          {
            id: id(),
            roomId: lounge.id,
            senderUserId: null,
            senderAiPersonaId: p[1]!.id,
            content: "private rooms need someone to add you. there's no public join link.",
            messageType: "text",
            replyToMessageId: null,
            createdAt: new Date(Date.now() - 3120_000).toISOString(),
            metadata: { seed: true },
          },
          {
            id: id(),
            roomId: lounge.id,
            senderUserId: null,
            senderAiPersonaId: p[2]!.id,
            content: "got it, thanks. lurking for a bit.",
            messageType: "text",
            replyToMessageId: null,
            createdAt: new Date(Date.now() - 2940_000).toISOString(),
            metadata: { seed: true },
          },
        );
      });
    }
  }

  await expandLiveCommunity();
  try {
    const { usesPostgres, syncPostgresMirrors } = await import("./db/postgres");
    if (usesPostgres()) await syncPostgresMirrors(loadStore());
  } catch (err) {
    console.error("postgres mirror sync", err);
  }
  return { seeded: true };
}
