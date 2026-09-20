export type ExtractedSection = {
  title: string;
  content: string;
  kind:
    | "heading"
    | "procedure"
    | "faq"
    | "benefit"
    | "terminology"
    | "constraint"
    | "warning"
    | "general";
  tags: string[];
};

const KIND_HINTS: Array<[ExtractedSection["kind"], RegExp]> = [
  ["faq", /\b(faq|frequently asked|q:|question\s*:)/i],
  ["procedure", /\b(step\s+\d|how to|procedure|walkthrough|to (get|start|join|reset))/i],
  ["benefit", /\b(benefit|advantage|why use|feature)/i],
  ["terminology", /\b(glossary|terminology|definition|means\b)/i],
  ["constraint", /\b(limit|constraint|must not|do not|cannot|eligibility|requirement)/i],
  ["warning", /\b(warning|caution|important|never |scam|do not claim)/i],
];

function detectKind(title: string, content: string): ExtractedSection["kind"] {
  const blob = `${title}\n${content}`;
  for (const [kind, re] of KIND_HINTS) {
    if (re.test(blob)) return kind;
  }
  if (/^#{1,3}\s/.test(title) || title.length < 80) return "heading";
  return "general";
}

function tagsFrom(title: string, content: string) {
  const words = `${title} ${content}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4);
  return [...new Set(words)].slice(0, 8);
}

export function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export function extractFromPlainText(text: string): ExtractedSection[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const blocks = normalized.split(/\n(?=#{1,3}\s)/);
  const sections: ExtractedSection[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l) => l.trim().length);
    if (!lines.length) continue;
    const title = lines[0]!.replace(/^#+\s*/, "").trim();
    const content = lines.slice(1).join("\n").trim() || title;
    const headed = /^#{1,3}\s/.test(lines[0]!);
    if (!headed && content.length < 20 && sections.length) {
      sections[sections.length - 1]!.content += `\n${content}`;
      continue;
    }
    sections.push({
      title,
      content,
      kind: detectKind(title, content),
      tags: tagsFrom(title, content),
    });
  }
  if (sections.length === 0 && normalized.length) {
    sections.push({
      title: "Document",
      content: normalized.slice(0, 4000),
      kind: "general",
      tags: tagsFrom("Document", normalized),
    });
  }
  return sections;
}

export function extractTopicsFromSections(sections: ExtractedSection[]) {
  const topics = sections
    .filter((s) => s.kind === "heading" || s.title.length < 80)
    .map((s, i) => ({
      name: s.title.slice(0, 80),
      description: s.content.slice(0, 400),
      tags: s.tags,
      priority: Math.max(1, 10 - i),
      allowedAngles: anglesFor(s.kind),
    }));
  const unique = new Map<string, (typeof topics)[number]>();
  for (const t of topics) {
    const key = t.name.toLowerCase();
    if (!unique.has(key)) unique.set(key, t);
  }
  return [...unique.values()].slice(0, 40);
}

function anglesFor(kind: ExtractedSection["kind"]) {
  switch (kind) {
    case "procedure":
      return ["how-to", "checklist", "common-mistakes"];
    case "faq":
      return ["clarify", "compare", "point-to-docs"];
    case "benefit":
      return ["when-useful", "tradeoffs"];
    case "warning":
      return ["safety", "misconceptions"];
    case "constraint":
      return ["eligibility", "limits"];
    default:
      return ["overview", "related-docs", "examples"];
  }
}

export function relateTopics(
  topics: Array<{ name: string; tags: string[]; description: string }>,
) {
  return topics.map((t, i) => {
    const related: number[] = [];
    topics.forEach((other, j) => {
      if (i === j) return;
      const overlap = t.tags.filter((tag) => other.tags.includes(tag)).length;
      const nameHit =
        other.description.toLowerCase().includes(t.name.toLowerCase()) ||
        t.description.toLowerCase().includes(other.name.toLowerCase());
      if (overlap >= 2 || nameHit) related.push(j);
    });
    return related.slice(0, 4);
  });
}

export function decideTopicTransition(opts: {
  energy: number;
  messageCount: number;
  minutesOnTopic: number;
  relatedAvailable: boolean;
  relatedProbability: number;
  newProbability: number;
  rng?: () => number;
}): "stay" | "related" | "new" {
  const rng = opts.rng ?? Math.random;
  const fatigue =
    (opts.messageCount >= 7 ? 0.35 : 0) +
    (opts.messageCount >= 2 && opts.energy < 0.35 ? 0.4 : 0) +
    (opts.minutesOnTopic > 25 ? 0.2 : 0) +
    (opts.energy < 0.2 ? 0.25 : 0);
  if (rng() > Math.min(0.92, fatigue)) return "stay";
  const relatedWeight = opts.relatedAvailable ? opts.relatedProbability : 0;
  const newWeight = opts.newProbability;
  const total = relatedWeight + newWeight || 1;
  return rng() < relatedWeight / total ? "related" : "new";
}
