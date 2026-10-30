import { describe, expect, it } from "vitest";
import { chunkText, reviewDueAt } from "./knowledge.functions";

describe("property knowledge chunking", () => {
  it("returns no chunks for blank content", () => {
    expect(chunkText("  \n\n ")).toEqual([]);
  });

  it("keeps short content intact", () => {
    expect(chunkText("Room policies\n\nCheck-in begins at 14:00.")).toEqual([
      "Room policies\n\nCheck-in begins at 14:00.",
    ]);
  });

  it("splits long paragraphs within the configured size and preserves overlap", () => {
    const content = "x".repeat(2_200);
    const chunks = chunkText(content, 1_000, 100);
    expect(chunks.length).toBe(3);
    expect(chunks.every((chunk) => chunk.length <= 1_000)).toBe(true);
    expect(chunks[0].slice(-100)).toBe(chunks[1].slice(0, 100));
    expect(chunks[1].slice(-100)).toBe(chunks[2].slice(0, 100));
  });

  it("rejects invalid chunk and overlap sizes", () => {
    expect(() => chunkText("text", 0, 0)).toThrow("Chunk size must be positive");
    expect(() => chunkText("text", 100, 100)).toThrow("overlap must be smaller");
    expect(() => chunkText("text", 100, -1)).toThrow("overlap must be smaller");
  });
});

describe("knowledge review deadlines", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("uses shorter review cycles for live room and experience facts", () => {
    expect(Date.parse(reviewDueAt("room", now)) - now.getTime()).toBe(30 * 86_400_000);
    expect(Date.parse(reviewDueAt("experience", now)) - now.getTime()).toBe(60 * 86_400_000);
  });

  it("uses longer review cycles for policies and documents", () => {
    expect(Date.parse(reviewDueAt("policy", now)) - now.getTime()).toBe(180 * 86_400_000);
    expect(Date.parse(reviewDueAt("pdf", now)) - now.getTime()).toBe(180 * 86_400_000);
  });

  it("uses a conservative default for unknown source types", () => {
    expect(Date.parse(reviewDueAt("unknown", now)) - now.getTime()).toBe(90 * 86_400_000);
  });
});
