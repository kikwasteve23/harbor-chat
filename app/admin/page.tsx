"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/forms";

type Tab =
  | "overview"
  | "rooms"
  | "personas"
  | "knowledge"
  | "topics"
  | "state"
  | "activity"
  | "moderation"
  | "ai"
  | "analytics"
  | "logs"
  | "simulation";

const tabs: Tab[] = [
  "overview",
  "rooms",
  "personas",
  "knowledge",
  "topics",
  "state",
  "activity",
  "moderation",
  "ai",
  "analytics",
  "logs",
  "simulation",
];

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/admin");
    if (res.status === 401 || res.status === 403) {
      setError("Admin only. Sign in with the development admin account.");
      return;
    }
    setData(await res.json());
  }

  useEffect(() => {
    void reload();
  }, []);

  if (error) {
    return (
      <main className="p-8">
        <p className="text-danger">{error}</p>
        <Link className="text-accent" href="/login">
          Back to login
        </Link>
      </main>
    );
  }
  if (!data) return <main className="p-8 text-muted-foreground">Loading admin…</main>;

  const o = data.overview;

  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <div>
          <div className="text-lg font-semibold">Harbor Admin</div>
          <div className="text-xs text-muted-foreground">Production files are replaceable here — do not hard-code personas or topics.</div>
        </div>
        <Button variant="outline" asChild>
          <Link href="/rooms">Back to chat</Link>
        </Button>
      </header>
      <div className="flex">
        <nav className="w-52 space-y-1 border-r border-border p-3">
          {tabs.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`block w-full rounded-lg px-3 py-2 text-left text-sm capitalize ${tab === t ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50"}`}
            >
              {t}
            </button>
          ))}
        </nav>
        <section className="flex-1 p-6">
          {tab === "overview" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Users", o.users],
                ["Rooms", o.rooms],
                ["Messages", o.messages],
                ["Persona pool", o.personas],
                ["Assigned AI", o.assigned],
                ["Documents", o.documents],
                ["Topics", o.topics],
                ["Open reports", o.openReports],
                ["Tokens logged", o.tokenUsage],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-2xl bg-card p-4">
                  <div className="text-xs text-muted-foreground">{k}</div>
                  <div className="mt-1 text-2xl font-semibold">{v}</div>
                </div>
              ))}
            </div>
          ) : null}

          {tab === "rooms" ? <RoomsPanel data={data} onChange={reload} /> : null}
          {tab === "personas" ? <PersonaPanel data={data} onChange={reload} /> : null}
          {tab === "knowledge" ? <KnowledgePanel data={data} onChange={reload} /> : null}
          {tab === "topics" ? (
            <div className="space-y-3">
              {(data.topics ?? []).map((t: any) => (
                <div key={t.id} className="rounded-xl bg-card p-4">
                  <div className="font-medium">{t.name}</div>
                  <div className="text-sm text-muted-foreground">{t.description}</div>
                  <div className="mt-1 text-xs">priority {t.priority} · {t.tags?.join(", ")}</div>
                </div>
              ))}
            </div>
          ) : null}
          {tab === "state" ? (
            <pre className="overflow-auto rounded-xl bg-card p-4 text-xs">{JSON.stringify(data.conversation, null, 2)}</pre>
          ) : null}
          {tab === "activity" || tab === "ai" ? <SettingsPanel data={data} onChange={reload} /> : null}
          {tab === "moderation" ? <ModerationPanel data={data} onChange={reload} /> : null}
          {tab === "analytics" ? (
            <pre className="overflow-auto rounded-xl bg-card p-4 text-xs">{JSON.stringify(data.analytics?.slice(0, 30), null, 2)}</pre>
          ) : null}
          {tab === "logs" ? (
            <div className="space-y-2">
              {(data.logs ?? []).map((e: any) => (
                <div key={e.id} className="rounded-lg bg-card p-3 text-sm">
                  <span className="font-mono text-xs">{e.createdAt}</span> · {e.decision} — {e.reason}
                </div>
              ))}
            </div>
          ) : null}
          {tab === "simulation" ? <SimulationPanel data={data} /> : null}
        </section>
      </div>
    </main>
  );
}

function RoomsPanel({ data, onChange }: { data: any; onChange: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div>
      <form
        className="mb-6 max-w-lg space-y-2 rounded-xl bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await fetch("/api/rooms", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, description, roomType: "public" }),
          });
          const json = await res.json();
          if (!res.ok) toast.error(json.error);
          else {
            setName("");
            onChange();
          }
        }}
      >
        <Label>New public room</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
        <Button>Create</Button>
      </form>
      <div className="space-y-2">
        {data.rooms.map((r: any) => (
          <div key={r.id} className="rounded-xl bg-card p-4">
            <div className="font-medium">{r.name}</div>
            <div className="text-sm text-muted-foreground">
              {r.roomType} · {r.activityMode} · {r.isActive ? "active" : "paused"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PersonaPanel({ data, onChange }: { data: any; onChange: () => void }) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="space-y-4">
      <form
        className="rounded-xl bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const fd = new FormData(form);
          fd.set("confirmed", String(confirmed));
          const res = await fetch("/api/admin/personas", { method: "POST", body: fd });
          const json = await res.json();
          if (!res.ok) toast.error(json.error);
          else {
            toast.success(`Imported ${json.count} personas`);
            onChange();
          }
        }}
      >
        <div className="font-medium">Upload Excel persona pool</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Columns: persona_id, display_name, region, experience_level, personality, communication_style. Names are display-name data only — never real user accounts.
        </p>
        <input className="mt-3 block" type="file" name="file" accept=".xlsx,.xls,.csv" required />
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I confirm this file may be used as synthetic/display-name data for AI personas.
        </label>
        <Button className="mt-3" type="submit">
          Replace pool
        </Button>
      </form>
      <div className="grid gap-2 md:grid-cols-2">
        {data.personas.map((p: any) => (
          <div key={p.id} className="rounded-xl bg-card p-3 text-sm">
            <div className="font-medium">{p.displayName}</div>
            <div className="text-muted-foreground">
              {p.sourcePersonaId} · {p.region} · {p.personality} · {p.experienceLevel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KnowledgePanel({ data, onChange }: { data: any; onChange: () => void }) {
  return (
    <div className="space-y-4">
      <form
        className="rounded-xl bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const res = await fetch("/api/admin/documents", { method: "POST", body: fd });
          const json = await res.json();
          if (!res.ok) toast.error(json.error);
          else {
            toast.success("Document ingested");
            onChange();
          }
        }}
      >
        <div className="font-medium">Upload documentation (PDF, DOCX, MD, TXT, HTML)</div>
        <p className="text-sm text-muted-foreground">This becomes the authoritative knowledge and topic source.</p>
        <input className="mt-3 block" type="file" name="file" required />
        <Button className="mt-3">Ingest</Button>
      </form>
      {data.documents.map((d: any) => (
        <div key={d.id} className="rounded-xl bg-card p-3 text-sm">
          {d.filename} · {d.status} · {d.fileType}
        </div>
      ))}
    </div>
  );
}

function SettingsPanel({ data, onChange }: { data: any; onChange: () => void }) {
  const s = data.settings;
  const [form, setForm] = useState(s);
  return (
    <form
      className="grid max-w-xl gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        const res = await fetch("/api/admin", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...form,
            maxActiveAiPerRoom: Number(form.maxActiveAiPerRoom),
            inactivityThresholdMinutes: Number(form.inactivityThresholdMinutes),
            inactivityWarningMinutes: Number(form.inactivityWarningMinutes),
            relatedTopicProbability: Number(form.relatedTopicProbability),
            newTopicProbability: Number(form.newTopicProbability),
            typingDelayMinMs: Number(form.typingDelayMinMs),
            typingDelayMaxMs: Number(form.typingDelayMaxMs),
            maxBotResponseChars: Number(form.maxBotResponseChars),
            aiParticipationIntensity: Number(form.aiParticipationIntensity),
            temperature: Number(form.temperature),
            maxAiResponsesPerEvent: Number(form.maxAiResponsesPerEvent),
          }),
        });
        if (res.ok) {
          toast.success("Settings saved");
          onChange();
        }
      }}
    >
      {[
        ["maxActiveAiPerRoom", "Max active AI per room"],
        ["inactivityWarningMinutes", "Inactivity warning (minutes)"],
        ["inactivityThresholdMinutes", "Max inactivity (minutes)"],
        ["relatedTopicProbability", "Related-topic transition probability"],
        ["newTopicProbability", "New documented topic probability"],
        ["typingDelayMinMs", "Typing delay min (ms)"],
        ["typingDelayMaxMs", "Typing delay max (ms)"],
        ["maxBotResponseChars", "Max AI message length"],
        ["aiParticipationIntensity", "Participation intensity 0–1"],
        ["temperature", "Model temperature"],
        ["maxAiResponsesPerEvent", "Max AI replies per event"],
        ["aiProvider", "Provider (mock|openai)"],
        ["aiModel", "Model name"],
      ].map(([key, label]) => (
        <div key={key}>
          <Label>{label}</Label>
          <Input
            className="mt-1"
            value={form[key] ?? ""}
            onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          />
        </div>
      ))}
      <div>
        <Label>Blocked phrases (comma separated)</Label>
        <Input
          className="mt-1"
          value={(form.blockedPhrases ?? []).join(", ")}
          onChange={(e) => setForm({ ...form, blockedPhrases: e.target.value.split(",").map((x: string) => x.trim()) })}
        />
      </div>
      <Button>Save</Button>
    </form>
  );
}

function ModerationPanel({ data, onChange }: { data: any; onChange: () => void }) {
  const [targetId, setTargetId] = useState("");
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-4">
      <form
        className="max-w-lg space-y-2 rounded-xl bg-card p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await fetch("/api/admin/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "moderate", targetId, moderateAction: "mute", reason }),
          });
          onChange();
        }}
      >
        <Label>Mute user id</Label>
        <Input value={targetId} onChange={(e) => setTargetId(e.target.value)} />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
        <div className="flex gap-2">
          <Button>Mute 6h</Button>
          <Button
            type="button"
            variant="danger"
            onClick={async () => {
              await fetch("/api/admin/actions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "moderate", targetId, moderateAction: "ban", reason }),
              });
              onChange();
            }}
          >
            Ban
          </Button>
        </div>
      </form>
      <div className="font-medium">Reports</div>
      {(data.reports ?? []).map((r: any) => (
        <div key={r.id} className="rounded-lg bg-card p-3 text-sm">
          {r.status} · {r.reason} · message {r.messageId}
        </div>
      ))}
      <div className="font-medium">Audit</div>
      {(data.moderation ?? []).map((e: any) => (
        <div key={e.id} className="text-xs text-muted-foreground">
          {e.createdAt} {e.action} {e.reason}
        </div>
      ))}
    </div>
  );
}

function SimulationPanel({ data }: { data: any }) {
  const roomId = data.rooms?.[0]?.id;
  const [snap, setSnap] = useState<any>(null);
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">
        Run the orchestrator on the first room with no human required. Decisions appear in logs rather than as a posting schedule.
      </p>
      <Button
        onClick={async () => {
          const res = await fetch("/api/admin/actions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "simulate", roomId }),
          });
          setSnap(await res.json());
        }}
      >
        Step simulation
      </Button>
      {snap ? <pre className="mt-4 overflow-auto rounded-xl bg-card p-4 text-xs">{JSON.stringify(snap, null, 2)}</pre> : null}
    </div>
  );
}
