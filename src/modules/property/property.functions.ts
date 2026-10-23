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
  currency: string | null;
  status: "active" | "setup" | "suspended";
  is_active: boolean;
};

type PropertyDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      staynas_list_properties: { Args: Record<string, never>; Returns: StayNasPropertyRecord[] };
      staynas_set_active_property: { Args: { _property_id: string }; Returns: { user_id: string; property_id: string; updated_at: string } };
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
