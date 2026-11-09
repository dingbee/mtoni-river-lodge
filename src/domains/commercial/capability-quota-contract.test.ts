import { describe, expect, it } from "vitest";
import {
  COMMERCIAL_MODULE_CODES,
  DIRECT_BOOKING_CAMPAIGN_STUDIO_ADDON_CODE,
  commercialAddonSchema,
} from "./catalogue-contract";

describe("CPS-02 commercial capability and quota contracts", () => {
  it("registers the permanent booking, campaign studio and advanced analytics capabilities", () => {
    expect(COMMERCIAL_MODULE_CODES).toContain("direct_booking_pages");
    expect(COMMERCIAL_MODULE_CODES).toContain("campaign_studio");
    expect(COMMERCIAL_MODULE_CODES).toContain("campaign_analytics_advanced");
    expect(DIRECT_BOOKING_CAMPAIGN_STUDIO_ADDON_CODE).toBe("direct_booking_campaign_studio");
  });

  it("preserves legacy add-on payloads without inventing quota defaults", () => {
    const parsed = commercialAddonSchema.parse({
      code: "legacy_addon",
      name: "Legacy add-on",
      description: "Existing catalogue record",
      status: "active",
    });
    expect(parsed.quotaPolicies).toEqual([]);
  });

  it("accepts founder-defined concurrent property campaign quotas", () => {
    const parsed = commercialAddonSchema.parse({
      code: DIRECT_BOOKING_CAMPAIGN_STUDIO_ADDON_CODE,
      name: "Direct Booking & Campaign Studio",
      description: "Permanent booking pages and property campaign pages",
      status: "active",
      quotaPolicies: [{
        featureCode: "campaign_studio",
        metric: "campaign_pages.max_active_per_property",
        limit: 5,
        scope: "property",
        period: "concurrent",
      }],
    });
    expect(parsed.quotaPolicies[0]?.limit).toBe(5);
  });

  it("rejects duplicate quota policies for the same feature and scope", () => {
    const result = commercialAddonSchema.safeParse({
      code: DIRECT_BOOKING_CAMPAIGN_STUDIO_ADDON_CODE,
      name: "Direct Booking & Campaign Studio",
      description: "Duplicate policy test",
      status: "active",
      quotaPolicies: [
        { featureCode: "campaign_studio", metric: "campaign_pages.max_active_per_property", limit: 5, scope: "property", period: "concurrent" },
        { featureCode: "campaign_studio", metric: "campaign_pages.max_active_per_property", limit: 8, scope: "property", period: "concurrent" },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative quota limits and unregistered capability codes", () => {
    const negative = commercialAddonSchema.safeParse({
      code: DIRECT_BOOKING_CAMPAIGN_STUDIO_ADDON_CODE,
      name: "Direct Booking & Campaign Studio",
      description: "Invalid quota",
      status: "active",
      quotaPolicies: [{ featureCode: "campaign_studio", metric: "campaign_pages.max_active_per_property", limit: -1, scope: "property", period: "concurrent" }],
    });
    const unknownFeature = commercialAddonSchema.safeParse({
      code: DIRECT_BOOKING_CAMPAIGN_STUDIO_ADDON_CODE,
      name: "Direct Booking & Campaign Studio",
      description: "Invalid capability",
      status: "active",
      quotaPolicies: [{ featureCode: "unknown_feature", metric: "campaign_pages.max_active_per_property", limit: 5, scope: "property", period: "concurrent" }],
    });
    expect(negative.success).toBe(false);
    expect(unknownFeature.success).toBe(false);
  });
});
