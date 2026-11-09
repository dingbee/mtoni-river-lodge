import { afterEach, describe, expect, it, vi } from "vitest";
import { callAiGateway, parseAiJson } from "./ai-gateway.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider-independent AI gateway", () => {
  it("sends a server-configured OpenAI-compatible request and validates the response shape", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "test-secret");
    vi.stubEnv("AI_PROVIDER_BASE_URL", "https://inference.example/v1");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "{\"answer\":\"hello\"}" } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await callAiGateway({ system: "system", user: "hello", jsonMode: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(url).toBe("https://inference.example/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer test-secret");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBeLessThanOrEqual(2_000);
    expect(result.content).toContain("hello");
    expect(result.requestId).toBeTruthy();
    expect(parseAiJson(result.content)).toEqual({ answer: "hello" });
  });

  it("supports structured tool calls and enforces the hard output-token ceiling", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "test-secret");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: null, tool_calls: [{
        id: "call-1", type: "function",
        function: { name: "lookup_availability", arguments: "{\\"check_in\\":\\"2026-12-01\\"}" },
      }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callAiGateway({
      system: "system",
      user: "check dates",
      maxTokens: 99_999,
      tools: [{ type: "function", function: { name: "lookup_availability", parameters: { type: "object" } } }],
      toolChoice: "required",
    });
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body.max_tokens).toBe(2_000);
    expect(body.tool_choice).toBe("required");
    expect(result.toolCalls[0].function.name).toBe("lookup_availability");
  });

  it("retries transient provider failures within the configured bound", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "test-secret");
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "recovered" } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await callAiGateway({ system: "system", user: "hello", maxRetries: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.content).toBe("recovered");
  });

  it("fails closed when no provider credential is configured", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(callAiGateway({ system: "system", user: "hello" }))
      .rejects.toThrow("AI service is not configured.");
  });

  it("does not expose provider response bodies on authentication failure", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret provider diagnostic", { status: 401 })));
    await expect(callAiGateway({ system: "system", user: "hello", maxRetries: 0 }))
      .rejects.toThrow("AI service authentication is unavailable.");
  });

  it("returns a controlled error for malformed provider JSON", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not-json", { status: 200 })));
    await expect(callAiGateway({ system: "system", user: "hello", maxRetries: 0 }))
      .rejects.toThrow("AI service returned an invalid response.");
  });

  it("returns a controlled timeout failure without leaking the underlying error", async () => {
    vi.stubEnv("AI_PROVIDER_API_KEY", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError")));
    await expect(callAiGateway({ system: "system", user: "hello", maxRetries: 0 }))
      .rejects.toThrow("AI service is temporarily unavailable.");
  });
});
