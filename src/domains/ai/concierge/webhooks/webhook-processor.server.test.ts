import { describe, expect, it } from "vitest";
import { messageStatus } from "./webhook-processor.server";

describe("provider delivery state projection", () => {
  it.each([
    ["sent", "accepted"],
    ["delivered", "delivered"],
    ["read", "read"],
    ["bounced", "undeliverable"],
    ["failed", "failed"],
    ["complained", "failed"],
    ["unsubscribed", "failed"],
  ] as const)("maps %s to %s", (event, expected) => {
    expect(messageStatus(event)).toBe(expected);
  });
  it("does not project inbound message events onto outbound delivery state", () => {
    expect(messageStatus("inbound_message")).toBeNull();
  });
});
