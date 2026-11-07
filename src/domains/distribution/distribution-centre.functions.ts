import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { staynasRpc } from "@/lib/staynas-rpc";

type SafeConnection = {
  id: string; provider: string; external_account_id: string;
  external_property_id: string; status: string; mapping_version: number;
  last_validated_at: string | null; last_error_code: string | null;
  created_at: string; updated_at: string;
};

export const getDistributionCentre = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const propertyRpc = staynasRpc(context.supabase);
    const [{ data: globalRoles, error: globalRoleError }, { data: propertyRole, error: propertyRoleError }, { data: propertyId, error: activePropertyError }] = await Promise.all([
      context.supabase.rpc("current_user_roles"),
      propertyRpc.rpc("staynas_current_property_role"),
      propertyRpc.rpc("staynas_active_property_id"),
    ]);
    if (globalRoleError) throw new Error(globalRoleError.message);
    if (propertyRoleError) throw new Error(propertyRoleError.message);
    if (activePropertyError) throw new Error(activePropertyError.message);
    const normalized = [
      ...((globalRoles ?? []).map((role) => String(role))),
      ...(propertyRole ? [String(propertyRole)] : []),
    ];
    if (!normalized.some((role) => ["owner", "manager", "admin"].includes(role))) {
      throw new Error("Forbidden");
    }

    // Resolve the authenticated user's active property, never a global booking
    // property. This RPC returns only a property the caller is a member of.
    if (!propertyId) throw new Error("No accessible active property is configured");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: property, error: propertyError } = await supabaseAdmin
      .from("staynas_properties")
      .select("id, organisation_id, name, currency, timezone, status")
      .eq("id", propertyId)
      .maybeSingle();
    if (propertyError) throw new Error(propertyError.message);
    if (!property || property.status !== "active") throw new Error("Active property not found or unavailable");

    const { data: connections, error: connectionError } = await supabaseAdmin
      .from("staynas_distribution_connections")
      .select("id, provider, external_account_id, external_property_id, status, mapping_version, last_validated_at, last_error_code, created_at, updated_at")
      .eq("organisation_id", property.organisation_id)
      .eq("property_id", property.id)
      .order("created_at", { ascending: false });
    if (connectionError) throw new Error(connectionError.message);

    const connectionIds = (connections ?? []).map((item) => item.id);
    const [mappingResult, operationResult, inboxResult] = await Promise.all([
      connectionIds.length
        ? supabaseAdmin.from("staynas_distribution_mappings")
            .select("id, connection_id, mapping_type, internal_id, external_id, active, version, updated_at")
            .eq("organisation_id", property.organisation_id)
            .eq("property_id", property.id)
            .in("connection_id", connectionIds)
            .order("mapping_type")
        : Promise.resolve({ data: [], error: null }),
      connectionIds.length
        ? supabaseAdmin.from("staynas_distribution_operations")
            .select("id, connection_id, operation_type, status, error_code, safe_error_message, attempt_count, created_at, updated_at")
            .eq("organisation_id", property.organisation_id)
            .eq("property_id", property.id)
            .in("connection_id", connectionIds)
            .order("created_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [], error: null }),
      connectionIds.length
        ? supabaseAdmin.from("staynas_distribution_reservation_inbox")
            .select("id, connection_id, external_reservation_id, event_type, processing_status, safe_error_code, safe_error_message, received_at, processed_at")
            .eq("organisation_id", property.organisation_id)
            .eq("property_id", property.id)
            .in("connection_id", connectionIds)
            .order("received_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (mappingResult.error) throw new Error(mappingResult.error.message);
    if (operationResult.error) throw new Error(operationResult.error.message);
    if (inboxResult.error) throw new Error(inboxResult.error.message);

    return {
      property: { id: property.id, organisationId: property.organisation_id, name: property.name, currency: property.currency, timezone: property.timezone },
      connections: (connections ?? []) as SafeConnection[],
      mappings: mappingResult.data ?? [],
      operations: operationResult.data ?? [],
      inbox: inboxResult.data ?? [],
      runtime: {
        providerAdaptersRegistered: 0,
        outboundDispatchEnabled: false,
        inboundCanonicalWriterEnabled: false,
        credentialsConfigured: false,
      },
    };
  });
