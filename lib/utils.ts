import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nowIso() {
  return new Date().toISOString();
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

export function pickRandom<T>(items: T[]): T {
  if (items.length === 0) {
    throw new Error("Cannot pick from empty list");
  }
  return items[Math.floor(Math.random() * items.length)]!;
}

export function sampleN<T>(items: T[], n: number): T[] {
  const copy = [...items];
  const out: T[] = [];
  while (copy.length && out.length < n) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]!);
  }
  return out;
}

export function hoursOfDay(date = new Date()) {
  return date.getHours() + date.getMinutes() / 60;
}

export function minutesSince(iso: string | null | undefined, from = Date.now()) {
  if (!iso) return Number.POSITIVE_INFINITY;
  return (from - new Date(iso).getTime()) / 60000;
}

export function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function wordOverlapScore(query: string, text: string) {
  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "is",
    "are",
    "was",
    "be",
    "this",
    "that",
    "with",
    "it",
    "as",
    "at",
    "by",
    "from",
    "you",
    "we",
    "i",
  ]);
  const tokens = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stop.has(w));
  const q = new Set(tokens(query));
  if (q.size === 0) return 0;
  const t = tokens(text);
  let hits = 0;
  for (const w of t) if (q.has(w)) hits += 1;
  return hits / Math.sqrt(q.size * Math.max(1, t.length));
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatDay(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
