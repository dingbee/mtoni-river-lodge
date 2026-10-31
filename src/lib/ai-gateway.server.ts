// Provider-independent, OpenAI-compatible server-side AI transport.
// Preferred configuration is controlled by Nolmark through server-only
// environment variables. Legacy Lovable routing remains an explicit
// compatibility fallback until the new provider credentials are provisioned.
export const AI_GATEWAY_DEFAULT_MODEL = process.env.STAYNAS_AI_MODEL ?? "google/gemini-2.5-flash";
const LEGACY_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export interface AiGatewayCallOptions {
  system: string; user: string; jsonMode?: boolean; model?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
}
export interface AiGatewayResult {
  content: string; latencyMs: number; model: string; provider: "staynas" | "legacy";
}
type GatewayConfig = { url: string; key: string; model: string; provider: "staynas" | "legacy" };
function resolveGatewayConfig(): GatewayConfig {
  const url = process.env.STAYNAS_AI_BASE_URL;
  const key = process.env.STAYNAS_AI_API_KEY;
  const model = process.env.STAYNAS_AI_MODEL;
  if (url || key || model) {
    if (!url || !key || !model) {
      throw new Error("StayNas AI provider configuration is incomplete. Configure STAYNAS_AI_BASE_URL, STAYNAS_AI_API_KEY and STAYNAS_AI_MODEL together.");
    }
    return { url, key, model, provider: "staynas" };
  }
  const legacyKey = process.env.LOVABLE_API_KEY;
  if (!legacyKey) throw new Error("StayNas AI is not configured. Contact the Nolmark founder administrator.");
  return { url: LEGACY_GATEWAY_URL, key: legacyKey, model: "google/gemini-2.5-flash", provider: "legacy" };
}
export async function callAiGateway(opts: AiGatewayCallOptions): Promise<AiGatewayResult> {
  const config = resolveGatewayConfig();
  const model = opts.model ?? config.model;
  const messages = [
    { role: "system" as const, content: opts.system },
    ...(opts.history ?? []),
    { role: "user" as const, content: opts.user },
  ];
  const started = Date.now();
  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
    body: JSON.stringify({ model, messages, ...(opts.jsonMode ? { response_format: { type: "json_object" } } : {}) }),
  });
  const latencyMs = Date.now() - started;
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
    if (res.status === 402) throw new Error("AI provider quota is exhausted. Contact the administrator.");
    throw new Error(`AI request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return { content: json.choices?.[0]?.message?.content ?? "", latencyMs, model, provider: config.provider };
}
export function parseAiJson<T = unknown>(s: string): T | null {
  try { return JSON.parse(s) as T; } catch { /* fall through */ }
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) { try { return JSON.parse(fenced[1]) as T; } catch { /* ignore */ } }
  const start = s.indexOf("{"); const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) { try { return JSON.parse(s.slice(start, end + 1)) as T; } catch { /* ignore */ } }
  return null;
}
