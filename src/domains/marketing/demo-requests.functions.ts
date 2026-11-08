import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StayNasDemoRequestRecord } from "./demo-requests";

async function assertFounder(context: { supabase: SupabaseClient }) {
  const { data, error } = await context.supabase.rpc("is_staynas_founder_ai_admin");
  if (error || data !== true) throw new Error("Founder access is required.");
}

export const listStayNasDemoRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounder(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const store = supabaseAdmin as unknown as SupabaseClient;
    const { data, error } = await store
      .from("staynas_website_demo_requests")
      .select("id, name, email, phone, company, country, property_type, property_count_band, interests, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw new Error("Unable to load StayNas demo requests.");
    return (data ?? []) as unknown as StayNasDemoRequestRecord[];
  });

export const updateStayNasDemoRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; status: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(input?.id ?? "")) throw new Error("A valid request ID is required.");
    if (!["new", "contacted", "qualified", "converted", "closed"].includes(input.status)) throw new Error("Invalid request status.");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertFounder(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const store = supabaseAdmin as unknown as SupabaseClient;
    const { error } = await store
      .from("staynas_website_demo_requests")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("Unable to update the demo request.");
    return { ok: true };
  });
