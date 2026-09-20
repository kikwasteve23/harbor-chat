import fs from "node:fs";
import path from "node:path";
import { hashPassword } from "./auth";
import { ingestDocument, importPersonasFromBuffer } from "./platform";
import { mutateStore, loadStore } from "./store";
import { nowIso } from "./utils";

function id() {
  return crypto.randomUUID();
}

export async function bootstrapIfNeeded() {
  const s = loadStore();
  if (s.seeded && s.profiles.length > 0) return { seeded: false };

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
        displayName: "Harbor Admin",
        email: adminEmail,
        passwordHash: adminHash,
        avatarUrl: null,
        bio: "Platform administrator (development seed).",
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
        displayName: "Demo Member",
        email: demoEmail,
        passwordHash: demoHash,
        avatarUrl: null,
        bio: "Sample human participant for local development.",
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
        description: "Public onboarding room. Development seed.",
        roomType: "public",
        isActive: true,
        activityMode: "adaptive",
        createdAt: now,
        createdBy: adminId,
      },
      {
        id: qaId,
        name: "Product Q&A",
        description: "Ask about documented Harbor features only.",
        roomType: "public",
        isActive: true,
        activityMode: "adaptive",
        createdAt: now,
        createdBy: adminId,
      },
      {
        id: mentorsId,
        name: "Mentors",
        description: "Private room for slower, practical discussion.",
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
    }
  });

  const store = loadStore();
  const lounge = store.rooms.find((r) => r.name === "Welcome Lounge");
  const persona = store.aiPersonas[0];
  if (lounge && persona) {
    mutateStore((st) => {
      st.messages.push(
        {
          id: id(),
          roomId: lounge.id,
          senderUserId: demoId,
          senderAiPersonaId: null,
          content: "Hey — is this the right place to learn how rooms and AI labels work?",
          messageType: "text",
          replyToMessageId: null,
          createdAt: new Date(Date.now() - 3600_000).toISOString(),
          metadata: { seed: true },
        },
        {
          id: id(),
          roomId: lounge.id,
          senderUserId: null,
          senderAiPersonaId: persona.id,
          content:
            "Yes. This lounge is public. AI participants are labeled AI — imported names are display names, not real people. Features should match the uploaded Harbor guide.",
          messageType: "text",
          replyToMessageId: null,
          createdAt: new Date(Date.now() - 3500_000).toISOString(),
          metadata: { seed: true },
        },
        {
          id: id(),
          roomId: lounge.id,
          senderUserId: adminId,
          senderAiPersonaId: null,
          content: "Correct. If a policy isn't in the knowledge base, we don't invent it.",
          messageType: "text",
          replyToMessageId: null,
          createdAt: new Date(Date.now() - 3400_000).toISOString(),
          metadata: { seed: true },
        },
      );
    });
  }

  return { seeded: true, loungeId: lounge?.id };
}
