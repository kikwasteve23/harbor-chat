import type { LlmProvider, LlmRequest, LlmResult } from "./types";

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
  const personaMatch = blob.match(/name:\s*(.+)/i);
  const humanMatch = blob.match(/HUMAN MESSAGE:\s*([\s\S]+?)(?:\n[A-Z]|$)/i);
  const topicMatch = blob.match(/CURRENT TOPIC:\s*(.+)/i);
  return {
    knowledge: knowledgeMatch?.[0] ?? "",
    persona: personaMatch?.[1] ?? "",
    human: humanMatch?.[1]?.trim() ?? "",
    topic: topicMatch?.[1]?.trim() ?? "",
    blob,
  };
}

function factLine(knowledge: string, seed: number) {
  const lines = knowledge
    .split("\n")
    .map((l) => l.replace(/^[-*#\d.\s]+/, "").replace(/KNOWLEDGE BASE/i, "").trim())
    .filter((l) => l.length > 28 && l.length < 220);
  if (!lines.length) return null;
  return lines[seed % lines.length]!;
}

export const mockProvider: LlmProvider = {
  name: "mock",
  async generate(req: LlmRequest): Promise<LlmResult> {
    const { knowledge, human, topic, blob } = extractKnowledge(req.messages);
    const seed = hashString(blob + String(Date.now()).slice(0, -3));
    const fact = factLine(knowledge, seed);
    const factual = /[?]|how|what|when|where|join|private|pay|earn|eligib|policy|feature|step/i.test(human);

    let text: string;
    if (factual && fact) {
      text = pick(seed, [
        fact,
        `Yeah — ${fact.charAt(0).toLowerCase()}${fact.slice(1)}`,
        `From what I remember: ${fact}`,
        `${fact} That's the version I go by.`,
      ]);
    } else if (factual && !fact) {
      text = pick(seed, [
        "Not sure that's written down anywhere official. I'd ask a moderator before treating it as a rule.",
        "I wouldn't guess on that one. Check the room info or ping an admin.",
        "Can't confirm that from what we have here.",
      ]);
    } else if (fact) {
      text = pick(seed, [
        fact.length > 140 ? `${fact.slice(0, 140).trim()}…` : fact,
        `Makes sense. ${fact.split(".")[0]}.`,
        topic ? `We've been on ${topic} for a bit — ${fact.split(".")[0].toLowerCase()}.` : fact,
        "Same. I'm mostly lurking unless someone has a concrete question.",
        "lol yeah. Keep it in the thread so people joining later can catch up.",
      ]);
    } else {
      text = pick(seed, [
        "Anyone still around for this?",
        "I'll be in and out — drop a question if you get stuck.",
        "Quiet in here. Morning crowd usually picks up later.",
        topic ? `Was thinking about ${topic} again. Anyone tried the steps yet?` : "What's everyone working on today?",
        "Leaving this here and grabbing coffee. Back in a bit.",
      ]);
    }

    text = text.replace(/\s+/g, " ").trim();
    if (text.length > 280) text = `${text.slice(0, 279).trimEnd()}…`;
    return {
      text,
      promptTokens: Math.ceil(blob.length / 4),
      completionTokens: Math.ceil(text.length / 4),
      provider: "mock",
      model: req.model || "mock-grounded",
    };
  },
};
