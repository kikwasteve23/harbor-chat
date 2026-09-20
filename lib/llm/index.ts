import { mockProvider } from "./mock";
import { openaiProvider } from "./openai";
import type { LlmProvider } from "./types";

export { mockProvider } from "./mock";
export { openaiProvider } from "./openai";
export type { LlmProvider, LlmRequest, LlmResult, LlmMessage } from "./types";

export function getLlmProvider(name?: string): LlmProvider {
  const id = (name || process.env.AI_PROVIDER || "mock").toLowerCase();
  if (id === "openai" && process.env.AI_API_KEY) return openaiProvider;
  return mockProvider;
}
