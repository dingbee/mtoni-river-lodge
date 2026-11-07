import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getConfiguredBookingPropertyId } from "@/lib/booking-property.server";

type SafeConnection = {
  id: string; provider: string; external_account_id: string;
  external_property_id: string; status: string; mapping_version: number;
  last_validated_at: string | null; last_error_code: string | null;
  created_at: string; updated_at: string;
};

export const getDistributionCentre = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles, error: rolesError } = await context.supabase.rpc("current_user_roles");
    if (rolesError) throw new Error(rolesError.message);
    const normalized = (roles ?? []).map((role) => String(role));
    if (!normalized.some((role) => ["owner", "manager", "admin"].includes(role))) {
      throw new Error("Forbidden");
    }

    const propertyId = await getConfiguredBookingPropertyId(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: property, error: propertyError }, { data: connections, error: connectionError }] = await Promise.all([
      supabaseAdmin.from("staynas_properties").select("id, organisation_id, name, currency, timezone").eq("id", propertyId).maybeSingle(),
      supabaseAdmin.from("staynas_distribution_connections")
        .select("id, provider, external_account_id, external_property_id, status, mapping_version, last_validated_at, last_error_code, created_at, updated_at")
        .eq("property_id", propertyId).order("created_at", { ascending: false }),
    ]);
    if (propertyError) throw new Error(propertyError.message);
    if (!property) throw new Error("Active property not found");
    if (connectionError) throw new Error(connectionError.message);

    const connectionIds = (connections ?? []).map((item) => item.id);
    const [mappingResult, operationResult, inboxResult] = await Promise.all([
      connectionIds.length
        ? supabaseAdmin.from("staynas_distribution_mappings")
            .select("id, connection_id, mapping_type, internal_id, external_id, active, version, updated_at")
            .eq("property_id", propertyId).order("mapping_type")
        : Promise.resolve({ data: [], error: null }),
      connectionIds.length
        ? supabaseAdmin.from("staynas_distribution_operations")
            .select("id, connection_id, operation_type, status, error_code, safe_error_message, attempt_count, created_at, updated_at")
            .eq("property_id", propertyId).order("created_at", { ascending: false }).limit(50)
        : Promise.resolve({ data: [], error: null }),
      connectionIds.length
        ? supabaseAdmin.from("staynas_distribution_reservation_inbox")
            .select("id, connection_id, external_reservation_id, event_type, processing_status, safe_error_code, safe_error_message, received_at, processed_at")
            .eq("property_id", propertyId).order("received_at", { ascending: false }).limit(50)
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
