import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StayNasPropertyRecord = {
  id: string;
  organisation_id: string;
  organisation_name: string;
  name: string;
  code: string;
  slug: string;
  timezone: string;
  currency: string;
  status: "active" | "setup" | "suspended";
  is_active: boolean;
};

type PropertyDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      staynas_list_properties: { Args: Record<string, never>; Returns: StayNasPropertyRecord[] };
      staynas_set_active_property: { Args: { _property_id: string }; Returns: { user_id: string; property_id: string; updated_at: string } };
      staynas_update_property_currency: { Args: { _currency: string }; Returns: Array<{ property_id: string; currency: string; updated_at: string }> };
    };
  };
};
function propertyClient(client: SupabaseClient<Database>) {
  return client as SupabaseClient<PropertyDatabase>;
}

export const listStayNasProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await propertyClient(context.supabase).rpc("staynas_list_properties");
    if (error) throw new Error(error.message);
    return (data ?? []) as StayNasPropertyRecord[];
  });

export const setStayNasActiveProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await propertyClient(context.supabase).rpc("staynas_set_active_property", {
      _property_id: data.propertyId,
    });
    if (error) throw new Error(error.message);
    return { propertyId: data.propertyId };
  });


export const updateStayNasPropertyCurrency = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    currency: z.string().trim().regex(/^[A-Za-z]{3}$/).transform((value) => value.toUpperCase()),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await propertyClient(context.supabase).rpc(
      "staynas_update_property_currency",
      { _currency: data.currency },
    );
    if (error) throw new Error(error.message);
    const row = Array.isArray(result) ? result[0] : result;
    if (!row?.property_id || row.currency !== data.currency) {
      throw new Error("Property currency update could not be verified.");
    }
    return { propertyId: row.property_id as string, currency: row.currency as string };
  });
