import type { PlatformSettings } from "../types";

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  messages: LlmMessage[];
  temperature: number;
  maxTokens: number;
  model: string;
}

export interface LlmResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  provider: string;
  model: string;
}

export interface LlmProvider {
  name: string;
  generate(req: LlmRequest): Promise<LlmResult>;
}

export function providerFromSettings(settings: PlatformSettings): string {
  return process.env.AI_PROVIDER || settings.aiProvider || "mock";
}
