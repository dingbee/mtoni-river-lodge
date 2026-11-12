import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { requireStayNasModuleAccess } from "@/lib/staynas-authorization.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// All front-desk reads/writes are staff-only â€” RLS enforces is_staff().

export const listFrontDeskBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStayNasModuleAccess(context.supabase, context.userId, "front-desk");
    const sb = context.supabase;
    const { data: propertyId, error: propertyError } = await sb.rpc("staynas_active_property_id");
    if (propertyError || !propertyId) throw new Error("Active property context is unavailable");
    const { data: isStaff, error: staffError } = await sb.rpc("is_any_staff", {
      _user_id: context.userId,
    });
    if (staffError) throw new Error(staffError.message);
    if (!isStaff) throw new Error("Forbidden");
    const { data, error } = await sb
      .from("bookings")
      .select(
        "id, reference, guest_name, guest_email, guest_phone, check_in, check_out, nights, adults, children, total, currency, balance_amount, status, payment_status, guest_type, room_id, guest_id, source, created_at",
      )
      .order("check_in", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    const roo¶»§q«^