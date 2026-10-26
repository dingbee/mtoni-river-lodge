import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveTxt } from "node:dns/promises";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const registerSchema = z.object({
  propertyId: z.string().uuid(),
  hostname: z.string().trim().toLowerCase().min(3).max(253)
    .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/),
  primary: z.boolean().default(false),
});

async function requireFounder(context: any) {
  // Global admin-like roles alone are insufficient: tenant administrators must
  // never inherit access to the cross-tenant domain registry.
  const email = String(context.claims?.email ?? "").trim().toLowerCase();
  if (email !== "nolmarkcdma@gmail.com") {
    throw new Error("Forbidden: Nolmark Founder Admin access required");
  }
  const { data: roles, error } = await context.supabase.rpc("current_user_roles");
  if (error || !(roles ?? []).map(String).some((role: string) =>
    ["admin", "founder_admin", "super_admin"].includes(role))) {
    throw new Error("Forbidden: Founder Admin role required");
  }
}

function normalizeHostname(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

async function audit(admin: any, args: {
  propertyId: string; domainId?: string | null; hostname: string; action: string;
  actorUserId: string; details?: Record<string, unknown>;
}) {
  const { error } = await admin.from("staynas_domain_verification_audit").insert({
    property_id: args.propertyId, domain_id: args.domainId ?? null,
    hostname: args.hostname, action: args.action, actor_user_id: args.actorUserId,
    details: args.details ?? {},
  });
  if (error) throw new Error("Domain action could not be recorded in the audit log");
}

export const listFounderDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFounder(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).from("staynas_property_domains")
      .select("id,property_id,hostname,is_primary,verified_at,verification_method,verification_status,last_checked_at,last_verification_error,created_at,updated_at,staynas_properties!inner(name,slug,status)")
      .order("created_at", { ascending: false }).limit(500);
    if (error) throw new Error("Unable to load registered property domains");
    return (data ?? []).map((row: any) => ({
      id: row.id, propertyId: row.property_id, hostname: row.hostname,
      primary: row.is_primary, verifiedAt: row.verified_at,
      verificationMethod: row.verification_method, verificationStatus: row.verification_status,
      lastCheckedAt: row.last_checked_at,
      lastVerificationError: row.last_verification_error ? "The last verification attempt failed. Retry after checking DNS." : null,
      createdAt: row.created_at, propertyName: row.staynas_properties?.name ?? "Unknown property",
      propertySlug: row.staynas_properties?.slug ?? "", propertyStatus: row.staynas_properties?.status ?? "unknown",
    }));
  });

export const registerFounderDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => registerSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const hostname = normalizeHostname(data.hostname);
    if (hostname === "localhost" || hostname.endsWith(".vercel.app")) {
      throw new Error("Register a tenant-owned custom domain, not a platform preview hostname");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: property, error: propertyError } = await (supabaseAdmin as any).from("staynas_properties")
      .select("id,name").eq("id", data.propertyId).maybeSingle();
    if (propertyError || !property) throw new Error("The selected property does not exist");
    const { data: existing, error: lookupError } = await (supabaseAdmin as any).from("staynas_property_domains")
      .select("id,property_id").ilike("hostname", hostname).maybeSingle();
    if (lookupError) throw new Error("Unable to check hostname ownership");
    if (existing && existing.property_id !== data.propertyId) {
      throw new Error("This hostname is already registered to another property");
    }
    const token = `staynas-domain-verification=${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    let domain: any;
    if (existing) {
      const { data: updated, error } = await (supabaseAdmin as any).from("staynas_property_domains")
        .update({ verification_token: token, verification_method: "dns_txt", verification_status: "pending",
          last_checked_at: null, last_verification_error: null, verified_at: null, verified_by: null,
          updated_at: now, is_primary: data.primary })
        .eq("id", existing.id).eq("property_id", data.propertyId).select("id,hostname").single();
      if (error || !updated) throw new Error("Unable to reset domain verification");
      domain = updated;
    } else {
      const { data: created, error } = await (supabaseAdmin as any).from("staynas_property_domains")
        .insert({ property_id: data.propertyId, hostname, is_primary: data.primary,
          verification_token: token, verification_method: "dns_txt", verification_status: "pending" })
        .select("id,hostname").single();
      if (error || !created) throw new Error("Unable to register hostname");
      domain = created;
    }
    if (data.primary) {
      const { error } = await (supabaseAdmin as any).from("staynas_property_domains")
        .update({ is_primary: false, updated_at: now }).eq("property_id", data.propertyId).neq("id", domain.id);
      if (error) throw new Error("Domain was registered, but primary-domain assignment needs reconciliation");
    }
    await audit(supabaseAdmin, { propertyId: data.propertyId, domainId: domain.id, hostname,
      action: "registered", actorUserId: context.userId, details: { verificationMethod: "dns_txt" } });
    return { id: domain.id, hostname, challengeName: `_staynas-verify.${hostname}`,
      challengeValue: token, verificationStatus: "pending" as const };
  });

export const verifyFounderDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ domainId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: domain, error: lookupError } = await (supabaseAdmin as any).from("staynas_property_domains")
      .select("id,property_id,hostname,verification_token,verification_status")
      .eq("id", data.domainId).maybeSingle();
    if (lookupError || !domain) throw new Error("Domain registration not found");
    if (domain.verification_status === "revoked") {
      throw new Error("This domain has been revoked. Register it again to issue a new DNS challenge before verification.");
    }
    if (!domain.verification_token) throw new Error("Register or reset the domain to generate a DNS challenge");
    const hostname = normalizeHostname(domain.hostname);
    const challengeName = `_staynas-verify.${hostname}`;
    const now = new Date().toISOString();
    let found = false;
    let safeError: string | null = null;
    try {
      const records = await resolveTxt(challengeName);
      found = records.flat().some((record: string) => record.trim() === domain.verification_token);
      if (!found) safeError = "TXT challenge record was not found or did not match";
    } catch {
      safeError = "DNS TXT lookup failed; check the record name, value, and DNS propagation";
    }
    if (found) {
      const { error } = await (supabaseAdmin as any).from("staynas_property_domains").update({
        verification_status: "verified", verified_at: now, verified_by: context.userId,
        last_checked_at: now, last_verification_error: null, updated_at: now,
      }).eq("id", domain.id);
      if (error) throw new Error("DNS ownership was confirmed but verification status could not be saved");
      await audit(supabaseAdmin, { propertyId: domain.property_id, domainId: domain.id,
        hostname, action: "verification_succeeded", actorUserId: context.userId,
        details: { method: "dns_txt", challengeName } });
      return { verified: true, status: "verified" as const, message: "DNS ownership confirmed. Domain activation remains subject to property and deployment readiness." };
    }
    const { error } = await (supabaseAdmin as any).from("staynas_property_domains").update({
      verification_status: "failed", last_checked_at: now, last_verification_error: safeError, updated_at: now,
    }).eq("id", domain.id);
    if (error) throw new Error("Verification failed and its status could not be saved");
    await audit(supabaseAdmin, { propertyId: domain.property_id, domainId: domain.id,
      hostname, action: "verification_failed", actorUserId: context.userId,
      details: { method: "dns_txt", challengeName, reason: safeError } });
    return { verified: false, status: "failed" as const, message: safeError ?? "DNS verification failed" };
  });

export const revokeFounderDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ domainId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: domain, error: lookupError } = await (supabaseAdmin as any).from("staynas_property_domains")
      .select("id,property_id,hostname").eq("id", data.domainId).maybeSingle();
    if (lookupError || !domain) throw new Error("Domain registration not found");
    const { error } = await (supabaseAdmin as any).from("staynas_property_domains").update({
      verification_status: "revoked", verified_at: null, verified_by: null,
      is_primary: false, updated_at: new Date().toISOString(),
    }).eq("id", domain.id);
    if (error) throw new Error("Unable to revoke domain verification");
    await audit(supabaseAdmin, { propertyId: domain.property_id, domainId: domain.id,
      hostname: domain.hostname, action: "revoked", actorUserId: context.userId });
    return { success: true };
  });


export const listFounderPropertiesForDomains = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFounder(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any).from("staynas_properties")
      .select("id,name,slug,status").order("name", { ascending: true }).limit(500);
    if (error) throw new Error("Unable to load properties for domain management");
    return data ?? [];
  });
