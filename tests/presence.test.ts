import { describe, expect, it } from "vitest";
import { MIN_DISPLAYED_ONLINE, floorOnlineCount, nextDisplayedOnline, randomChatDelayMs } from "../lib/services/presence";

describe("online presence", () => {
  it("never reports below 70", () => {
    expect(floorOnlineCount(0)).toBe(MIN_DISPLAYED_ONLINE);
    expect(floorOnlineCount(12)).toBe(MIN_DISPLAYED_ONLINE);
    expect(floorOnlineCount(91)).toBe(91);
  });

  it("drifts slowly but stays in range", () => {
    let n = 70;
    for (let i = 0; i < 40; i++) {
      n = nextDisplayedOnline(n, i % 3, () => 0.99);
      expect(n).toBeGreaterThanOrEqual(70);
      expect(n).toBeLessThanOrEqual(148);
    }
  });
});

describe("chat delay", () => {
  it("stays within 0–2 minutes", () => {
    for (let i = 0; i < 30; i++) {
      const d = randomChatDelayMs(0, 120_000);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(120_000);
    }
  });
});
