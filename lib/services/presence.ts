import { clamp } from "../utils";

export const MIN_DISPLAYED_ONLINE = 70;
export const MAX_DISPLAYED_ONLINE = 148;

export function nextDisplayedOnline(current: number, humansOnline: number, rng: () => number = Math.random) {
  const start = Number.isFinite(current) && current > 0 ? current : 82;
  const drift = Math.floor(rng() * 5) - 2;
  const humanBump = humansOnline > 0 ? 1 : 0;
  return clamp(start + drift + humanBump, MIN_DISPLAYED_ONLINE, MAX_DISPLAYED_ONLINE);
}

export function floorOnlineCount(count: number) {
  return Math.max(MIN_DISPLAYED_ONLINE, Math.floor(count || 0));
}
