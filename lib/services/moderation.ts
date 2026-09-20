const DEFAULT_BLOCKED = [
  "guaranteed income",
  "wire me",
  "send bitcoin",
  "risk-free profit",
  "guaranteed earnings",
];

export function normalizePhrase(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

export function findBlockedPhrase(content: string, extra: string[] = []) {
  const hay = normalizePhrase(content);
  for (const phrase of [...DEFAULT_BLOCKED, ...extra]) {
    const p = normalizePhrase(phrase);
    if (p && hay.includes(p)) return p;
  }
  return null;
}

export function looksLikeScamOrFabrication(content: string) {
  const c = content.toLowerCase();
  const patterns = [
    /i made \$?\d+/,
    /guaranteed (return|profit|income|payout)/,
    /wire (me|funds)/,
    /send (me )?(btc|bitcoin|crypto|gift card)/,
    /as a real (person|user) i (earned|was paid)/,
    /official payout of/,
  ];
  return patterns.some((re) => re.test(c));
}

export function sanitizeAiContent(content: string, maxChars: number) {
  let text = content.replace(/\s+/g, " ").trim();
  if (looksLikeScamOrFabrication(text) || findBlockedPhrase(text)) {
    return "I shouldn't state that — it isn't in the official documentation. Please rely on the uploaded Harbor docs for anything about money, eligibility, or guarantees.";
  }
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1).trimEnd()}…`;
  const q = (text.match(/\?/g) || []).length;
  if (q > 1) {
    const idx = text.indexOf("?");
    text = `${text.slice(0, idx + 1)}`;
  }
  return text;
}

export function rateLimitOk(history: number[], windowMs: number, max: number, now = Date.now()) {
  const recent = history.filter((t) => now - t < windowMs);
  return { ok: recent.length < max, recent };
}
