import { describe, expect, it, vi } from "vitest";
import type { AiGatewayResult } from "@/lib/ai-gateway.server";
import { assertConciergeEntitlement, persistConciergeUsage } from "./concierge.server";

function entitlementClient(result: { data: unknown; error: unknown }) {
  const query: {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  } = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return { from: vi.fn(() => query), query };
}

describe("Concierge runtime governance", () => {
  it("allows a property only when the founder entitlement is explicitly enabled", async () => {
    const client = entitlementClient({ data: { enabled: true }, error: null });
    await expect(assertConciergeEntitlement(client, "property-a")).resolves.toBeUndefined();
    expect(client.from).toHaveBeenCalledWith("ai_concierge_entitlements");
    expect(client.query.eq).toHaveBeenCalledWith("property_id", "property-a");
  });

  it("denies a property with no entitlement row", async () => {
    const client = entitlementClient({ data: null, error: null });
    await expect(assertConciergeEntitlement(client, "property-a"))
      .rejects.toThrow("AI Concierge is not enabled for this property.");
  });

  it("denies a property with an explicitly disabled entitlement", async () => {
    const client = entitlementClient({ data: { enabled: false }, error: null });
    await expect(assertConciergeEntitlement(client, "property-a"))
      .rejects.toThrow("AI Concierge is not enabled for this property.");
  });

  it("fails closed when entitlement storage cannot be read", async () => {
    const client = entitlementClient({ data: null, error: { code: "08006" } });
    await expect(assertConciergeEntitlement(client, "property-a"))
      .rejects.toThrow("Concierge entitlement could not be verified.");
  });

  it("persists provider request identity, model, latency and actual token usage", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ insert })) };
    const gateway: AiGatewayResult = {
      content: "response",
      latencyMs: 125,
      model: "test-model",
      provider: "openai-compatible",
      requestId: "request-123",
      toolCalls: [],
      usage: { prompt_tokens: 20, completion_tokens: 12, total_tokens: 32 },
    };

    await persistConciergeUsage(client, {
      propertyId: "property-a",
      sessionId: "session-a",
      userMessageId: "message-a",
      gateway,
    });

    expect(client.from).toHaveBeenCalledWith("ai_concierge_usage_ledger");
    expect(insert).toHaveBeenCalledWith({
      property_id: "property-a",
      session_id: "session-a",
      user_message_id: "message-a",
      request_id: "request-123",
      provider: "openai-compatible",
      model: "test-model",
      prompt_tokens: 20,
      completion_tokens: 12,
      total_tokens: 32,
      latency_ms: 125,
    });
  });

  it("does not silently accept a failed durable usage write", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: "23505" } });
    const client = { from: vi.fn(() => ({ insert })) };
    const gateway: AiGatewayResult = {
      content: "response",
      latencyMs: 25,
      model: "test-model",
      provider: "staynas",
      requestId: "request-duplicate",
      toolCalls: [],
      usage: undefined,
    };

    await expect(persistConciergeUsage(client, {
      propertyId: "property-a",
      sessionId: "session-a",
      userMessageId: "message-a",
      gateway,
    })).rejects.toThrow("AI usage evidence could not be recorded.");
  });
});
