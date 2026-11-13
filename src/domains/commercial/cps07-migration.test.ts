import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/20261112130000_cps07_subscription_addon_enforcement.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("CPS-07 database enforcement migration", () => {
  it("reuses the existing CC catalogue and subscription without parallel billing tables", () => {
    expect(migration).toContain("commercial_policy_config_current");
    expect(migration).toContain("commercial_policy_config_versions");
    expect(migration).toContain("commercial_subscriptions");
    expect(migration).toContain("commercial_entitlement_grant_rules");
    expect(migration).toContain("commercial_record_entitlement_decision");
    expect(migration).toContain("commercial_subscription_change_requests");
    expect(migration).not.toMatch(
      /CREATE TABLE IF NOT EXISTS public\.commercial_(invoices|payments|entitlements)/i,
    );
  });

  it("fails closed for anonymous requests and only bypasses for service role", () => {
    expect(migration).toContain("IF auth.role() = 'service_role' THEN");
    expect(migration).toContain("CPS-07 requires an authenticated tenant actor");
  });

  it("enforces booking page, campaign, content and offer writes at the database boundary", () => {
    for (const trigger of [
      "staynas_cps07_booking_page_entitlement",
      "staynas_cps07_campaign_entitlement",
      "staynas_cps07_campaign_content_entitlement",
 ¶»§q«^