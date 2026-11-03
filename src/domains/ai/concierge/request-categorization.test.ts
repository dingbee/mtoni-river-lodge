import { describe, expect, it } from "vitest";
import { categorizeGuestRequest } from "./request-categorization";

describe("categorizeGuestRequest", () => {
  it.each([
    ["Please send fresh towels and clean the room", "housekeeping"],
    ["Can you bring dinner to my room?", "room_service"],
    ["Please reserve a table for breakfast", "dining"],
    ["I need an airport pickup tomorrow", "airport_transfer"],
    ["The air conditioner is broken", "maintenance"],
    ["Please arrange a birthday surprise", "special_occasion"],
    ["Can you arrange private candlelight dining?", "private_dining"],
    ["The room is dirty and I am disappointed", "complaint"],
    ["I am still waiting and want compensation", "service_recovery"],
    ["Can someone help with this unusual request?", "other"],
  ] as const)("maps %s to %s", (text, expected) => {
    expect(categorizeGuestRequest(text)).toBe(expected);
  });

  it("prioritises private dining over generic dining keywords", () => {
    expect(categorizeGuestRequest("Please arrange a private dinner")).toBe("private_dining");
  });

  it("prioritises room service over generic meal keywords", () => {
    expect(categorizeGuestRequest("Please bring dinner to my room")).toBe("room_service");
  });
});
