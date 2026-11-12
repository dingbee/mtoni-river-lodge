import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function correlationId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

type AdminClient = SupabaseClient;
type AuthContext = { userId: string; supabase: SupabaseClient };

async function getAdminClient(): Promise<AdminClient> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as AdminClient;
}

async function getManagedProperty(context: AuthContext, admin: AdminClient) {
  const { data: selected, error: selectedError } = await admin
    .from("staynas_user_property_context")
    .select("property_id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (selectedError || !selected?.property_id) throw new Error("Select an active property first.");

  const [{ data: property, error: propertyError }, { data: membership, error: membershipError }] =
    await Promise.all([
      admin
        .from("staynas_properties")
        .select("id,organisation_id,status")
        .eq("id", selected.property_id)
        .maybeSingle(),
      admin
        .from("staynas_property_members")
        .select("property_id,user_id,role,status")
        .eq("property_id", selected.property_id)
        .eq("user_id", context.userId)
        .eq("status", "active")
        .maybeSingle(),
    ]);
  if (propertyError || !property || property.status !== "active")
    throw new Error("The selected property is not active.");
  if (membershipError || !membership || !["owner", "manager", "admin"].includes(membership.role)) {
    throw new Error("Active property owner or manager access is required.");
  }
  const { data: organisation, error: organisationError } = await admin
    .from("staynas_organisations")
    .select("status")
    .eq("id", property.organisation_id)
    .maybeSingle();
  if (organisationError || organisation?.status !== "active")
    throw new Error("The property organisation is not active.");
  return { property };
}

export const rotatePropertyDistributionCredential = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        connectionId: z.string().uuid(),
        apiKey: z.string().trim().min(1).max(65536),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdminClient();
    const { property } = await getManagedProperty(context, admin);
    const { data: connection, error: readError } = await admin
      .from("staynas_distribution_connections")
      .select("id,organisation_id,property_id,environment,lifecycle")
      .eq("id", data.connectionId)
      .eq("property_id", property.id)
      .maybeSingle();
    if (
      readError ||
      !connection ||
      connection.environment !== "sandbox" ||
      ["suspended", "revoked"].includes(connection.lifecycle)
    ) {
      throw new Error(
        "Credential rotation is available only for a non-revoked sandbox connection.",
      );
    }
    const { error } = await admin.rpc("staynas_rotate_distribution_credential", {
      _connection_id: connection.id,
      _organisation_id: property.organisation_id,
      _property_id: property.id,
      _actor_user_id: context.userId,
      _credential_secret: data.apiKey,
      _correlation_id: correlationId("dc07b-credential-rotate"),
    });
    if (error)
      throw new Error(
        "Credential rotation failed. The existing credential remains unchanged unless the database transaction committed.",
      );
    return { ok: true, state: "pending_validation" as const };
  });

export const transitionPropertyDistributionConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        connectionId: z.string().uuid(),
        action: z.enum(["suspend", "resume", "revoke"]),
        reason: z.string().trim().min(3).max(1000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdminClient();
    const { property } = await getManagedProperty(context, admin);
    const { data: connection, error: readError } = await admin
      .from("staynas_distribution_connections")
      .select("id,organisation_id,property_id,environment")
      .eq("id", data.connectionId)
      .eq("property_id", property.id)
      .maybeSingle();
    if (readError || !connection || connection.environment !== "sandbox") {
      throw new Error("The selected sandbox connection was not found.");
    }
    const { data: state, error } = await admin.rpc("staynas_transition_distribution_connection", {
      _connection_id: connection.id,
      _organisation_id: property.organisation_id,
      _property_id: property.id,
      _actor_user_id: context.userId,
      _action: data.action,
      _reason: data.reason,
      _correlation_id: correlationId("dc07b-connection-lifecycle"),
    });
    if (error || typeof state !== "string")
      throw new Error("The connection lifecycle transition failed.");
    return { ok: true, state };
  });
