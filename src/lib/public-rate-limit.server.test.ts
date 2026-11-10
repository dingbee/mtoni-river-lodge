import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consumePublicRateLimit } from "./public-rate-limit.server";

const rpc = (supabaseAdmin as any).rpc as ReturnType<typeof vi.fn>;

afterEach(() => {
  rpc.mockReset();
  vi.restoreAllMocks();
});

describe("public Concierge rate limiter", () => {
  it("hashes hostname and client address before calling the server-only limiter", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    const request = new Request("https://mtoniriverlodge.com/api/public/concierge/chat", {
      headers: { host: "mtoniriverlodge.com", "x-real-ip": "203.0.113.12" },
    });
    await expect(consumePublicRateLimit(request, "concierge-chat", 20, 60)).resolves.toBe(true);
    const args = rpc.mock.calls[0][1];
    expect(args.p_key_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(args.p_key_hash).not.toContain("203.0.113.12");
    expect(args).toMatchObject({ p_limit: 20, p_window_seconds: 60 });
  });

  it("returns false when the durable limiter blocks a request", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const request = new Request("https://mtoniriverlodge.com", { headers: { host: "mtoniriverlodge.com" } });
    await expect(consumePublicRateLimit(request, "concierge-chat", 20, 60)).resolves.toBe(false);
  });

  it("fails closed when the rate-limit database function is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "private database error" } });
    const request = new Request("https://mtoniriverlodge.com", { headers: { host: "mtoniriverlodge.com" } });
    await expect(consumePublicRateLimit(request, "concierge-chat", 20, 60)).resolves.toBe(false);
  });
});
