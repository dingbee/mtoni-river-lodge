import { randomUUID } from "node:crypto";

export const AI_GATEWAY_DEFAULT_MODEL =
  process.env.STAYNAS_AI_MODEL || process.env.AI_PROVIDER_MODEL || process.env.AI_MODEL ||
  process.env.OPENAI_MODEL || (process.env.LOVABLE_API_KEY ? "google/gemini-2.5-flash" : "gpt-4.1-mini");

type AiGatewayProvider = "staynas" | "openai-compatible" | "legacy";
type AiGatewayConfig = { endpoint: string; key: string; model: string; provider: AiGatewayProvider };

export interface AiGatewayTool {
  type: "function";
  function: { name: string; description?: string; parameters: Record<string, unknown>; strict?: boolean };
}

export interface AiGatewayCallOptions {
  system: string;
  user: string;
  jsonMode?: boolean;
  model?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  tools?: AiGatewayTool[];
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface AiGatewayToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AiGatewayResult {
  content: string;
  latencyMs: number;
  model: string;
  provider: AiGatewayProvider;
  requestId: string;
  toolCalls: AiGatewayToolCall[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2;
const HARD_MAX_OUTPUT_TOKENS = 2_000;

function resolveGatewayConfig(): AiGatewayConfig {
  const staynasUrl = process.env.STAYNAS_AI_BASE_URL;
  const staynasKey = process.env.STAYNAS_AI_API_KEY;
  const staynasModel = process.env.STAYNAS_AI_MODEL;
  if (staynasUrl || staynasKey || staynasModel) {
    if (!staynasUrl || !staynasKey || !staynasModel) {
      throw new Error("StayNas AI provider configuration is incomplete. Configure STAYNAS_AI_BASE_URL, STAYNAS_AI_API_KEY and STAYNAS_AI_MODEL together.");
    }
    return { endpoint: staynasUrl, key: staynasKey, model: staynasModel, provider: "staynas" };
  }

  const providerKey = process.env.AI_PROVIDER_API_KEY || process.env.OPENAI_API_KEY;
  if (providerKey) {
    const configuredBase = process.env.AI_PROVIDER_BASE_URL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    const base = configuredBase.replace(/\/+$/, "");
    const endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
    const model = process.env.AI_PROVIDER_MODEL || process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    return { endpoint, key: providerKey, model, provider: "openai-compatible" };
  }

  const legacyKey = process.env.LOVABLE_API_KEY;
  if (legacyKey) {
    return {
      endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: legacyKey,
      model: "google/gemini-2.5-flash",
      provider: "legacy",
    };
  }

  throw new Error("AI service is not configured.");
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value!))) : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeProviderError(status: number): Error {
  if (status === 401 || status === 403) return new Error("AI service authentication is unavailable.");
  if (status === 429) return new Error("AI service is temporarily busy. Please try again shortly.");
  if (status === 402) return new Error("AI service usage limit has been reached.");
  if (status === 408) return new Error("AI service timed out. Please try again.");
  return new Error("AI service is temporarily unavailable.");
}

/**
 * Provider-independent OpenAI-compatible server transport.
 * Credentials are read only from server environment variables and are never
 * included in logs, responses, or browser-facing errors.
 */
export async function callAiGateway(opts: AiGatewayCallOptions): Promise<AiGatewayResult> {
  const config = resolveGatewayConfig();
  const model = opts.model?.trim() || config.model;
  const requestId = randomUUID();
  const timeoutMs = boundedInteger(opts.timeoutMs, DEFAULT_TIMEOUT_MS, 1_000, 60_000);
  const maxRetries = boundedInteger(opts.maxRetries, MAX_RETRIES, 0, 3);
  const maxTokens = boundedInteger(opts.maxTokens, 1_000, 1, HARD_MAX_OUTPUT_TOKENS);
  const messages = [
    { role: "system" as const, content: opts.system },
    ...(opts.history ?? []),
    { role: "user" as const, content: opts.user },
  ];

  const body = {
    model,
    messages,
    max_tokens: maxTokens,
    ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}),
    ...(opts.tools?.length ? { tools: opts.tools, tool_choice: opts.toolChoice ?? "auto" } : {}),
  };

  const started = Date.now();
  let response: Response | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.key}`,
          "X-Request-ID": requestId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (attempt < maxRetries) {
        await delay(Math.min(250 * 2 ** attempt, 1_000));
        continue;
      }
      console.warn("[ai-gateway] provider request failed", {
        requestId, model, latencyMs: Date.now() - started,
        failure: error instanceof Error && error.name === "AbortError" ? "timeout" : "network",
      });
      throw new Error("AI service is temporarily unavailable.");
    } finally {
      clearTimeout(timeout);
    }

    if (response.ok) break;
    if (RETRYABLE.has(response.status) && attempt < maxRetries) {
      await delay(Math.min(250 * 2 ** attempt, 1_000));
      continue;
    }
    console.warn("[ai-gateway] provider returned non-success status", {
      requestId, model, status: response.status, latencyMs: Date.now() - started,
    });
    throw safeProviderError(response.status);
  }

  if (!response?.ok) throw new Error("AI service is temporarily unavailable.");

  let payload: {
    choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }>; tool_calls?: AiGatewayToolCall[] } }>;
    usage?: AiGatewayResult["usage"];
  };
  try {
    payload = await response.json();
  } catch {
    console.warn("[ai-gateway] malformed provider response", { requestId, model });
    throw new Error("AI service returned an invalid response.");
  }

  const message = payload.choices?.[0]?.message;
  const content = typeof message?.content === "string"
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((part) => part.text ?? "").join("")
      : "";
  if (!content.trim() && !(message?.tool_calls?.length)) {
    console.warn("[ai-gateway] empty provider response", { requestId, model });
    throw new Error("AI service returned an empty response.");
  }

  const latencyMs = Date.now() - started;
  console.info("[ai-gateway] request completed", {
    requestId, model, latencyMs, totalTokens: payload.usage?.total_tokens ?? null,
  });
  return {
    content,
    latencyMs,
    model,
    provider: config.provider,
    requestId,
    toolCalls: message?.tool_calls ?? [],
    usage: payload.usage,
  };
}

/** Strict JSON parser for structured model responses. */
export function parseAiJson<T = unknown>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenced) {
      try { return JSON.parse(fenced[1]) as T; } catch { /* reject malformed output */ }
    }
    return null;
  }
}
