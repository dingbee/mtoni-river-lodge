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

export const listStayNasProperties = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("staynas_list_properties");
    if (error) throw new Error(error.message);
    return (data ?? []) as StayNasPropertyRecord[];
  });

export const setStayNasActiveProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("staynas_set_active_property", {
      _property_id: data.propertyId,
    });
    if (error) throw new Error(error.message);
    return { propertyId: data.propertyId };
  });
