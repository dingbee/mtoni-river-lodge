import { describe, expect, it } from "vitest";
import { classifyIntent } from "./concierge.intent";

describe("Concierge child-age pricing intent", () => {
  it("maps every explicitly supplied child age into the SPE occupancy buckets", () => {
    const intent = classifyIntent("We are 2 adults and 2 children aged 3 and 8.");
    expect(intent.detected).toMatchObject({
      adults: 2,
      children: 2,
      children_below_6: 1,
      children_7_plus: 1,
    });
  });

  it("does not infer age buckets when child ages are missing", () => {
    const intent = classifyIntent("We are 2 adults and 2 children.");
    expect(intent.detected.children).toBe(2);
    expect(intent.detected.children_below_6).toBeNull();
    expect(intent.detected.children_7_plus).toBeNull();
  });

  it("requires clarification for the unclassified age of six", () => {
    const intent = classifyIntent("We are 2 adults and 1 child aged 6.");
    expect(intent.detected.children).toBe(1);
    expect(intent.detected.children_below_6).toBeNull();
    expect(intent.detected.children_7_plus).toBeNull();
  });
});
