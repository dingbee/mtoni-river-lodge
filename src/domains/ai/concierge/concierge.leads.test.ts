import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: vi.fn() },
}));

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { captureLead } from "./concierge.leads";

const PROPERTY = "11111111-1111-4111-8111-111111111111";
const OTHER_PROPERTY = "22222222-2222-4222-8222-222222222222";
const TOKEN = "cnc_" + "a".repeat(43);

function sessionRead(data: unknown) {
  const q: any = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return q;
}

function leadInsert(data: unknown) {
  const q: any = {
    upsert: vi.fn(() => q),
    select: vi.fn(() => q),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  return q;
}

function existingLead(data: unknown) {
  const q: any = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    single: vi.fn(async () => ({ data, error: null })),
  };
  return q;
}

function sessionUpdate() {
  let count = 0;
  const q: any = {
    update: vi.fn(() => q),
    eq: vi.fn(() => {
      count += 1;
      return count === 2 ? Promise.resolve({ error: null }) : q;
    }),
  };
  return q;
}

const admin = supabaseAdmin as any;

function setup(sessionProperty = PROPERTY, inserted = { id: "lead-1", intent_level: "high" }, duplicate = false) {
  const session = sessionRead({ id: "session-1", property_id: sessionProperty });
  const insert = leadInsert(duplicate ? null : inserted);
  const existing = existingLead(inserted);
  const update = sessionUpdate();
  const leadCalls = { count: 0 };
  admin.from.mockImplementation((table: string) => {
    if (table === "ai_concierge_sessions") {
      return admin.from.mock.calls.filter((call: any[]) => call[0] === table).length === 1 ? session : update;
    }
    if (table === "ai_concierge_leads") {
      leadCalls.count += 1;
      return leadCalls.count === 1 ? insert : existing;
    }
    throw new Error("unexpected table");
  });
  return { session, insert, existing, update };
}

const validInput = {
  session_token: TOKEN,
  consent: true,
  name: "Guest Example",
  email: "GUEST@example.com",
  travel_period_start: "2026-12-01",
  travel_period_end: "2026-12-03",
  adults: 2,
  children: 0,
  notes: "Interested in a river view.",
};

describe("property-scoped Concierge lead capture", () => {
  beforeEach(() => {
    admin.from.mockReset();
  });

  it("requires affirmative consent before touching the database", async () => {
    await expect(captureLead({ ...validInput, consent: false }, PROPERTY))
      .rejects.toThrow("Consent is required");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("requires a server-derived property and valid session token", async () => {
    await expect(captureLead(validInput, "")).rejects.toThrow("Property context is required");
    await expect(captureLead({ ...validInput, session_token: "arbitrary" }, PROPERTY))
      .rejects.toThrow("valid concierge session");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("creates a lead with mandatory property ownership and consent evidence", async () => {
    const { insert } = setup();
    const result = await captureLead(validInput, PROPERTY);
    expect(result).toMatchObject({ ok: true, lead_id: "lead-1", intent_level: "high" });
    const row = insert.upsert.mock.calls[0][0];
    expect(row.property_id).toBe(PROPERTY);
    expect(row.session_id).toBe("session-1");
    expect(row.email).toBe("guest@example.com");
    expect(row.consent_at).toBeTruthy();
    expect(row.consent_version).toBe("concierge-lead-v1");
    expect(row.idempotency_key).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a session belonging to another property", async () => {
    setup(OTHER_PROPERTY);
    await expect(captureLead(validInput, PROPERTY))
      .rejects.toThrow("invalid for this property");
  });

  it("returns the original lead for an idempotent duplicate submission", async () => {
    setup(PROPERTY, { id: "existing-lead", intent_level: "high" }, true);
    const result = await captureLead(validInput, PROPERTY);
    expect(result.lead_id).toBe("existing-lead");
    expect(admin.from).toHaveBeenCalledTimes(3);
  });

  it("rejects malformed email and invalid travel ranges", async () => {
    setup();
    await expect(captureLead({ ...validInput, email: "not-an-email" }, PROPERTY))
      .rejects.toThrow("valid email");
    admin.from.mockReset();
    setup();
    await expect(captureLead({ ...validInput, travel_period_start: "2026-12-04", travel_period_end: "2026-12-03" }, PROPERTY))
      .rejects.toThrow("valid travel date range");
  });
});
