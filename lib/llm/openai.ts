import type { LlmProvider, LlmRequest, LlmResult } from "./types";

export const openaiProvider: LlmProvider = {
  name: "openai",
  async generate(req: LlmRequest): Promise<LlmResult> {
    const key = process.env.AI_API_KEY;
    if (!key) {
      throw new Error("AI_API_KEY is not configured");
    }
    const base = process.env.AI_BASE_URL || "https://api.openai.com/v1";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        messages: req.messages,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LLM provider error ${res.status}: ${err.slice(0, 400)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      model?: string;
    };
    const text = json.choices?.[0]?.message?.content?.trim() || "";
    return {
      text,
      promptTokens: json.usage?.prompt_tokens ?? 0,
      completionTokens: json.usage?.completion_tokens ?? 0,
      provider: "openai",
      model: json.model || req.model,
    };
  },
};
