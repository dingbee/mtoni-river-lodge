import { describe, expect, it, vi } from "vitest";
import { assertFounderAiAdmin } from "./ai.authorization.server";

describe("assertFounderAiAdmin", () => {
  it("allows an authenticated Nolmark founder administrator", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }) };
    await expect(assertFounderAiAdmin(supabase as never, "founder-user")).resolves.toBeUndefined();
    expect(supabase.rpc).toHaveBeenCalledWith("is_staynas_founder_ai_admin");
  });

  it("rejects tenant owners and staff", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: false, error: null }) };
    await expect(assertFounderAiAdmin(supabase as never, "tenant-user"))
      .rejects.toThrow("Nolmark founder administration only");
  });

  it("fails closed when the authorization RPC errors", async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("RPC unavailable") }) };
    await expect(assertFounderAiAdmin(supabase as never, "founder-user"))
      .rejects.toThrow("Unable to verify founder AI administration access");
  });

  it("rejects an absent user before calling the database", async () => {
    const supabase = { rpc: vi.fn() };
    await expect(assertFounderAiAdmin(supabase as never, ""))
      .rejects.toThrow("Forbidden");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
