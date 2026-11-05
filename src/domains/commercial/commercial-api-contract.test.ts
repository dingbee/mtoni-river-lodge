import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_API_PATHS,
  commercialApiCatalogueRequestSchema,
  commercialApiCompositionValidationRequestSchema,
  commercialApiEnvelopeSchema,
  commercialApiFounderActionRequestSchema,
  commercialApiPriceResolutionRequestSchema,
  commercialApiTrialPolicyRequestSchema,
  createCommercialApiFailure,
} from "./commercial-api-contract";

describe("CC02.06 commercial API contracts", () => {
  it("publishes stable versioned route identifiers without implementing handlers", () => {
    expect(COMMERCIAL_API_PATHS.catalogue).toBe("/api/commercial/v1/catalogue");
    expect(COMMERCIAL_API_PATHS.priceResolution).toBe("/api/commercial/v1/prices/resolve");
  });

  it("validates catalogue read requests and defaults retired records off", () => {
    expect(commercialApiCatalogueRequestSchema.parse({
      requestId: "req-1",
      query: {},
    }).query.includeRetired).toBe(false);
  });

  it("validates exact currency, term, version and property-count pricing input", () => {
    const result = commercialApiPriceResolutionRequestSchema.safeParse({
      requestId: "req-2",
      body: {
        planCode: "professional",
        planVersion: 1,
        currency: "TZS",
        billingTerm: "annual",
        propertyCount: 2,
        asOf: "2026-11-05",
        addons: [],
      },
    });
    expect(result.success).toBe(true);
    expect(commercialApiPriceResolutionRequestSchema.safeParse({
      requestId: "req-3",
      body: {
        planCode: "professional",
        planVersion: 1,
        currency: "EUR",
        billingTerm: "annual",
        propertyCount: 2,
        asOf: "2026-11-05",
        addons: [],
      },
    }).success).toBe(false);
  });

  it("does not accept malformed composition payloads", () => {
    expect(commercialApiCompositionValidationRequestSchema.safeParse({
      requestId: "req-4",
      body: {
        composition: {
          planCode: "professional",
          planVersion: 1,
          status: "draft",
          moduleCodes: ["reservations", "reservations"],
          addonCodes: [],
          effectiveFrom: null,
          effectiveTo: null,
        },
      },
    }).success).toBe(false);
  });

  it("validates trial policy lookup against an exact plan version", () => {
    expect(commercialApiTrialPolicyRequestSchema.safeParse({
      requestId: "req-5",
      query: { planCode: "essential", planVersion: 1, asOf: "2026-11-05" },
    }).success).toBe(true);
  });

  it("requires a reason and an enumerated founder action for administration requests", () => {
    const valid = {
      requestId: "req-6",
      body: {
        action: "manage_commercial_pricing",
        resourceType: "price",
        resourceRef: "professional_tzs_monthly_v1",
        reason: "Approved price schedule update",
      },
    };
    expect(commercialApiFounderActionRequestSchema.safeParse(valid).success).toBe(true);
    expect(commercialApiFounderActionRequestSchema.safeParse({
      ...valid,
      body: { ...valid.body, reason: "x" },
    }).success).toBe(false);
    expect(commercialApiFounderActionRequestSchema.safeParse({
      ...valid,
      body: { ...valid.body, action: "tenant_admin_override" },
    }).success).toBe(false);
  });

  it("uses discriminated success and failure response envelopes", () => {
    const schema = commercialApiEnvelopeSchema(
      // Generic data payload for envelope shape verification.
      import.meta.env.MODE === "test" ? (awaitableObjectSchema()) : awaitableObjectSchema(),
    );
    expect(schema.safeParse({ ok: true, requestId: "req-7", data: { accepted: true } }).success).toBe(true);
    expect(schema.safeParse({
      ok: false,
      requestId: "req-8",
      error: { code: "FORBIDDEN", message: "Founder authority required" },
    }).success).toBe(true);
    expect(schema.safeParse({ ok: "true", requestId: "req-9", data: {} }).success).toBe(false);
  });

  it("creates validated, stable failure envelopes", () => {
    expect(createCommercialApiFailure("req-10", {
      code: "FORBIDDEN",
      message: "Founder authority required",
    })).toEqual({
      ok: false,
      requestId: "req-10",
      error: {
        code: "FORBIDDEN",
        message: "Founder authority required",
        fieldErrors: [],
        retryable: false,
      },
    });
    expect(() => createCommercialApiFailure("", {
      code: "INTERNAL_ERROR",
      message: "Failure",
    })).toThrow();
  });
});

function awaitableObjectSchema() {
  return (await import("zod")).z.object({ accepted: (await import("zod")).z.boolean() });
}
