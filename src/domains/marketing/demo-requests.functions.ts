import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertFounder(context: { supabase: any }) {
  const { data, error } = await (context.supabase as any).rpc("is_staynas_founder_ai_admin");
  if (error || data !== true) throw new Error("Founder access is required.");
}

export const listStayNasDemoRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertFounder(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("staynas_website_demo_requests")
      .select("id, name, email, phone, company, country, property_type, property_count_band, interests, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) throw new Error("Unable to load StayNas demo requests.");
    return data ?? [];
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
    const { error } = await (supabaseAdmin as any)
      .from("staynas_website_demo_requests")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("Unable to update the demo request.");
    return { ok: true };
  });
