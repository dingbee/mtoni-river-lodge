import { describe, expect, it } from "vitest";
import { stayNasDemoRequestSchema } from "./demo-requests";

const valid = {
  name: "Alex Example",
  email: "alex@example.com",
  propertyType: "Hotel / boutique property",
  properties: "1" as const,
  interests: ["Reservations & booking"],
};

describe("StayNas website demo request validation", () => {
  it("accepts a valid request and applies optional defaults", () => {
    const result = stayNasDemoRequestSchema.parse(valid);
    expect(result.phone).toBe("");
    expect(result.interests).toEqual(["Reservations & booking"]);
  });

  it("rejects an invalid email address", () => {
    expect(stayNasDemoRequestSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects unsupported property count bands", () => {
    expect(stayNasDemoRequestSchema.safeParse({ ...valid, properties: "many" }).success).toBe(false);
  });

  it("rejects overlong messages", () => {
    expect(stayNasDemoRequestSchema.safeParse({ ...valid, message: "x".repeat(2001) }).success).toBe(false);
  });
});
