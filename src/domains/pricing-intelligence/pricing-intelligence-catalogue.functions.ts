import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";

export const listPricingIntelligenceRooms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "ai.revenue");
    const { data: propertyId, error: propertyError } = await context.supabase.rpc("staynas_active_property_id", { _uid: context.userId });
    if (propertyError || !propertyId) throw new Error("Select an active property.");
    const { data: allowed, error: accessError } = await context.supabase.rpc("staynas_user_has_property_access", {
      _uid: context.userId, _property_id: propertyId,
    });
    if (accessError || !allowed) throw new Error("Property access denied.");
    const { data, error } = await context.supabase.from("rooms")
      .select("id,name,currency,total_units").eq("property_id", propertyId).eq("status", "active")
      .order("name").limit(200);
    if (error) throw new Error("Unable to load property room catalogue.");
    return data ?? [];
  });
