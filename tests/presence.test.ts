import { describe, expect, it } from "vitest";
import { MIN_DISPLAYED_ONLINE, floorOnlineCount, nextDisplayedOnline } from "../lib/services/presence";

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
