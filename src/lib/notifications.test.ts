import { describe, expect, it } from "vitest";
import { notificationChannelTopic } from "./notifications";

describe("notification realtime channel identity", () => {
  it("creates a distinct topic for each mounted hook instance", () => {
    const first = notificationChannelTopic(":r0:");
    const second = notificationChannelTopic(":r1:");

    expect(first).toBe("os-notifications-r0");
    expect(second).toBe("os-notifications-r1");
    expect(first).not.toBe(second);
  });

  it("removes React useId punctuation from the topic", () => {
    expect(notificationChannelTopic(":R12abc:")).toBe("os-notifications-R12abc");
  });

  it("rejects an empty or fully sanitized instance ID", () => {
    expect(() => notificationChannelTopic("")).toThrow();
    expect(() => notificationChannelTopic(":::")).toThrow();
  });
});
