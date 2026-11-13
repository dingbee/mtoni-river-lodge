import { describe, expect, it } from "vitest";
import { percentileMinutes, responseIntervals } from "./operational-intelligence.metrics";

const property = "property-1";
const session = "session-1";
const base = Date.parse("2026-11-12T09:00:00.000Z");
const row = (id: string, minute: number, direction: string, actor_type: string, extra: Record<string, unknown> = {}) => ({
  id, property_id: property, session_id: session, channel: "web", provider: null,
  provider_message_id: null, client_message_id: null, direction, actor_type,
  message_type: "text", status: "recorded", occurred_at: new Date(base + minute * 60_000).toISOString(),
  ...extra,
});

describe("SN-OC-04 operational metric contracts", () => {
  it("calculates continuous percentiles in minutes", () => {
    expect(percentileMinutes([60_000, 180_000], 0.5)).toBe(2);
    expect(percentileMinutes([60_000, 180_000], 0.9)).toBe(2.8);
    expect(percentileMinutes([], 0.5)).toBeNull();
  });

  it("pairs guest messages with the next delivered assistant or staff response", () => {
    const result = responseIntervals([
      row("g1", 0, "inbound", "guest"),
      row("a1", 3, "outbound", "assistant"),
      row("g2", 5, "inbound", "guest"),
      row("s1", 9, "outbound", "staff"),
    ]);
    expect(result.first).toEqual([180_000]);
    expect(result.ai).toEqual([180_000]);
    expect(result.human).toEqual([240_000]);
    expect(result.unanswered).toBe(0);
  });

  it("excludes templates, events and failed outbound messages", () => {
    const result = responseIntervals([
      row("g1", 0, "inbound", "guest"),
      row("template", 1, "outbound", "assistant", { message_type: "template" }),
      row("event", 2, "outbound", "system", { message_type: "event" }),
      row("failed", 3, "outbound", "assistant", { status: "failed" }),
      row("accepted", 4, "outbound", "assistant", { status: "accepted" }),
      row("delivered", 5, "outbound", "assistant", { status: "delivered" }),
    ]);
    expect(result.first).toEqual([240_000]);
    expect(result.ai).toEqual([240_000]);
    expect(result.unanswered).toBe(0);
  });

  it("deduplicates provider retries and preserves unanswered inbound conversations", () => {
    const duplicate = row("retry", 2, "outbound", "assistant", { provider: "meta", provider_message_id: "wamid-1" });
    const result = responseIntervals([
      row("g1", 0, "inbound", "guest"),
      row("g2", 1, "inbound", "guest"),
      duplicate,
      { ...duplicate, id: "retry-copy", occurred_at: new Date(base + 3 * 60_000).toISOString() },
    ]);
    expect(result.ai).toHaveLength(1);
    expect(result.unanswered).toBe(1);
  });
});
