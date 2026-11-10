import { describe, expect, it, vi } from "vitest";
import { normalizePublicHostname, PublicPropertyResolutionError, resolvePublicPropertyFromHostname } from "./public-property.server";

const PROPERTY_ID = "11111111-1111-4111-8111-111111111111";

function queryBuilder(terminal: "limit" | "maybeSingle", result: unknown) {
  const builder: Record<string, any> = {};
  for (const method of ["select", "eq", "not"]) builder[method] = vi.fn(() => builder);
  builder[terminal] = vi.fn(async () => result);
  return builder;
}

describe("public property hostname resolution", () => {
  it("normalizes a verified hostname and strips a port", () => {
    expect(normalizePublicHostname(" MTONIRIVERLODGE.COM:443 ")).toBe("mtoniriverlodge.com");
    expect(normalizePublicHostname("staynas.com.")).toBe("staynas.com");
  });

  it("rejects malformed, injected and non-domain host values", () => {
    expect(normalizePublicHostname(null)).toBeNull();
    expect(normalizePublicHostname("")).toBeNull();
    expect(normalizePublicHostname("evil.example, trusted.example")).toBeNull();
    expect(normalizePublicHostname("https://trusted.example")).toBeNull();
    expect(normalizePublicHostname("localhost")).toBeNull();
  });

  it("resolves exactly one verified domain to an active property", async () => {
    const domains = queryBuilder("limit", { data: [{ property_id: PROPERTY_ID }], error: null });
    const property = queryBuilder("maybeSingle", { data: { id: PROPERTY_ID }, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(domains).mockReturnValueOnce(property) };

    await expect(resolvePublicPropertyFromHostname("staynas.example.com", client)).resolves.toBe(PROPERTY_ID);
    expect(client.from).toHaveBeenNthCalledWith(1, "staynas_property_domains");
    expect(client.from).toHaveBeenNthCalledWith(2, "staynas_properties");
    expect(domains.eq).toHaveBeenCalledWith("verification_status", "verified");
    expect(domains.not).toHaveBeenCalledWith("verified_at", "is", null);
    expect(property.eq).toHaveBeenCalledWith("status", "active");
  });

  it("rejects unknown or unverified hostnames", async () => {
    const domains = queryBuilder("limit", { data: [], error: null });
    const client = { from: vi.fn().mockReturnValue(domains) };
    await expect(resolvePublicPropertyFromHostname("unknown.example.com", client))
      .rejects.toBeInstanceOf(PublicPropertyResolutionError);
    expect(client.from).toHaveBeenCalledTimes(1);
  });

  it("rejects ambiguous domain ownership", async () => {
    const domains = queryBuilder("limit", {
      data: [{ property_id: PROPERTY_ID }, { property_id: "22222222-2222-4222-8222-222222222222" }],
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(domains) };
    await expect(resolvePublicPropertyFromHostname("shared.example.com", client))
      .rejects.toBeInstanceOf(PublicPropertyResolutionError);
  });

  it("rejects inactive or currency-unconfigured properties", async () => {
    const domains = queryBuilder("limit", { data: [{ property_id: PROPERTY_ID }], error: null });
    const property = queryBuilder("maybeSingle", { data: null, error: null });
    const client = { from: vi.fn().mockReturnValueOnce(domains).mockReturnValueOnce(property) };
    await expect(resolvePublicPropertyFromHostname("inactive.example.com", client))
      .rejects.toBeInstanceOf(PublicPropertyResolutionError);
    expect(property.not).toHaveBeenCalledWith("currency", "is", null);
  });

  it("rejects database resolution errors without exposing them", async () => {
    const domains = queryBuilder("limit", { data: null, error: { message: "private database diagnostic" } });
    const client = { from: vi.fn().mockReturnValue(domains) };
    await expect(resolvePublicPropertyFromHostname("failure.example.com", client))
      .rejects.toThrow("This website is not configured for guest concierge services.");
  });
});
