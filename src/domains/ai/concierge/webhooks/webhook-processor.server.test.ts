import { describe, expect, it } from "vitest";
import { canTransitionMessageStatus, messageStatus } from "./webhook-processor.server";

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

describe("delivery status transition safety", () => {
  it("does not allow late failures to downgrade delivered or read messages", () => {
    expect(canTransitionMessageStatus("delivered", "failed")).toBe(false);
    expect(canTransitionMessageStatus("read", "undeliverable")).toBe(false);
  });
  it("allows delivery progress and terminal failure before confirmation", () => {
    expect(canTransitionMessageStatus("accepted", "delivered")).toBe(true);
    expect(canTransitionMessageStatus("accepted", "failed")).toBe(true);
    expect(canTransitionMessageStatus("failed", "delivered")).toBe(true);
  });
  it("does not regress a confirmed read state", () => {
    expect(canTransitionMessageStatus("read", "accepted")).toBe(false);
  });
});
