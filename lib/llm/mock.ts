import type { LlmProvider, LlmRequest, LlmResult } from "./types";

const closers = [
  "that's documented in the knowledge base",
  "that's how the current docs describe it",
  "worth checking the uploaded docs if you need the exact wording",
];

function hashString(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function pick(seed: number, items: string[]) {
  return items[seed % items.length]!;
}

function extractKnowledge(messages: LlmRequest["messages"]) {
  const blob = messages.map((m) => m.content).join("\n");
  const knowledgeMatch = blob.match(/KNOWLEDGE BASE[\s\S]*?(?=\n[A-Z ]{6,}|\nCURRENT|\nRECENT|$)/i);
  const personaMatch = blob.match(/PERSONA[\s\S]*?(?=\n[A-Z ]{6,}|$)/i);
  const humanMatch = blob.match(/HUMAN MESSAGE:\s*([\s\S]+?)(?:\n[A-Z]|$)/i);
  const topicMatch = blob.match(/CURRENT TOPIC:\s*(.+)/i);
  return {
    knowledge: knowledgeMatch?.[0] ?? "",
    persona: personaMatch?.[0] ?? "",
    human: humanMatch?.[1]?.trim() ?? "",
    topic: topicMatch?.[1]?.trim() ?? "",
    blob,
  };
}

function stylePrefix(persona: string) {
  const p = persona.toLowerCase();
  if (p.includes("curious") || p.includes("beginner")) return "Quick question from my side —";
  if (p.includes("practical") || p.includes("experienced")) return "Practical take:";
  if (p.includes("analytical")) return "If I compare what's documented,";
  if (p.includes("enthusiastic")) return "This part of the docs is actually useful:";
  if (p.includes("calm") || p.includes("reserved")) return "From the docs:";
  return "";
}

export const mockProvider: LlmProvider = {
  name: "mock",
  async generate(req: LlmRequest): Promise<LlmResult> {
    const { knowledge, persona, human, topic, blob } = extractKnowledge(req.messages);
    const seed = hashString(blob + String(Date.now()).slice(0, -4));
    const lines = knowledge
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 40 && !l.startsWith("KNOWLEDGE"));
    const factual = /how|what|when|where|eligib|policy|pay|earn|deadline|procedure|feature|rule/i.test(
      human,
    );
    let text: string;
    if (factual && lines.length === 0) {
      text =
        "I don't see that documented in the current knowledge base, so I shouldn't guess. Check the official Harbor docs or ask a moderator for the written policy.";
    } else if (lines.length === 0) {
      const topicBit = topic ? ` around ${topic}` : "";
      text = pick(seed, [
        `Been thinking about the current thread${topicBit}. Happy to keep it going if anyone wants to compare notes.`,
        `Quiet minute here. If we're still on this topic, the docs are the source of truth — I won't invent details.`,
        `I'll leave space for humans on this one. Ping if you want a pointer into the uploaded documentation.`,
      ]);
    } else {
      const snippet = lines[seed % lines.length]!.replace(/^[-*#\d.\s]+/, "").slice(0, 220);
      const prefix = stylePrefix(persona);
      if (factual) {
        text = `${prefix ? `${prefix} ` : ""}${snippet} If a number, deadline, or eligibility rule isn't in that excerpt, it isn't something I can confirm.`;
      } else {
        text = `${prefix ? `${prefix} ` : ""}${snippet} ${pick(seed + 3, closers)}.`;
      }
    }
    text = text.replace(/\s+/g, " ").trim();
    if (text.length > 420) text = `${text.slice(0, 419).trim()}…`;
    const promptTokens = Math.ceil(blob.length / 4);
    const completionTokens = Math.ceil(text.length / 4);
    return {
      text,
      promptTokens,
      completionTokens,
      provider: "mock",
      model: req.model || "mock-grounded",
    };
  },
};
