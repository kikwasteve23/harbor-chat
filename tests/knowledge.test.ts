import { describe, expect, it } from "vitest";
import {
  decideTopicTransition,
  extractFromPlainText,
  extractTopicsFromSections,
} from "../lib/services/knowledge";

const sample = `# Rooms

Public rooms are visible to members.

## FAQ

### Can I hide that someone is AI?

No. The AI disclosure label is required.

## Getting started procedure

1. Create an account
2. Open a public room

## Warning

Do not send money because someone in chat asked.
`;

describe("document extraction", () => {
  it("extracts headings procedures faqs and warnings", () => {
    const sections = extractFromPlainText(sample);
    expect(sections.length).toBeGreaterThan(3);
    const kinds = new Set(sections.map((s) => s.kind));
    expect(kinds.has("faq") || sections.some((s) => /faq/i.test(s.title))).toBe(true);
    expect(sections.some((s) => s.kind === "warning" || /warning/i.test(s.title))).toBe(true);
  });

  it("builds topics from sections", () => {
    const topics = extractTopicsFromSections(extractFromPlainText(sample));
    expect(topics.some((t) => /room/i.test(t.name))).toBe(true);
    expect(topics.length).toBeGreaterThan(2);
  });
});

describe("topic transitions", () => {
  it("stays when energy is high and count is low", () => {
    const d = decideTopicTransition({
      energy: 0.9,
      messageCount: 1,
      minutesOnTopic: 2,
      relatedAvailable: true,
      relatedProbability: 0.7,
      newProbability: 0.3,
      rng: () => 0.99,
    });
    expect(d).toBe("stay");
  });

  it("prefers related when configured 70/30 and energy is exhausted", () => {
    const d = decideTopicTransition({
      energy: 0.1,
      messageCount: 8,
      minutesOnTopic: 40,
      relatedAvailable: true,
      relatedProbability: 0.7,
      newProbability: 0.3,
      rng: () => 0.1,
    });
    expect(["related", "new"]).toContain(d);
    const related = decideTopicTransition({
      energy: 0,
      messageCount: 8,
      minutesOnTopic: 40,
      relatedAvailable: true,
      relatedProbability: 0.7,
      newProbability: 0.3,
      rng: () => 0.2,
    });
    expect(related).toBe("related");
  });
});
