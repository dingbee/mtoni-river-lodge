import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { GUEST_REQUEST_CATEGORIES, categorizeGuestRequest } from "./request-categorization";

const categorySchema = z.enum(GUEST_REQUEST_CATEGORIES);
const createSchema = z.object({
  request_text: z.string().trim().min(3).max(2000),
  category: categorySchema.optional(),
  session_id: z.string().uuid().nullable().optional(),
  booking_id: z.string().uuid().nullable().optional(),
  guest_id: z.string().uuid().nullable().optional(),
  intake_channel: z.enum(["web", "whatsapp", "email", "staff"]).default("staff"),
  priority: z.number().int().min(1).max(3).default(2),
  guest_name: z.string().trim().max(160).nullable().optional(),
  guest_contact: z.string().trim().max(200).nullable().optional(),
  requested_for: z.string().datetime().nullable().optional(),
});

async function activePropertyId(supabase: any, userId: string) {
  const { data: propertyId, error } = await supabase.rpc("staynas_active_property_id", { _uid: userId });
  if (error || !propertyId) throw new Error("Select an active property before handling guest requests.");
  const { data: access, error: accessError } = await supabase.rpc(
    "staynas_user_has_property_access", { _uid: userId, _property_id: propertyId },
  );
  if (accessError || !access) throw new Error("Active property access denied.");
  return propertyId as string;
}

export const createGuestRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: staff, error: staffError } = await context.supabase.rpc("is_any_staff", { _user_id: context.userId });
    if (staffError || !staff) throw new Error("Staff access is required to register a guest request.");

    if (data.session_id) {
      const { data: session, error } = await context.supabase
        .from("ai_concierge_sessions").select("id, property_id, guest_id")
        .eq("id", data.session_id).eq("property_id", propertyId).maybeSingle();
      if (error || !session) throw new Error("Concierge conversation not found in the active property.");
      if (data.guest_id && session.guest_id && data.guest_id !== session.guest_id) {
        throw new Error("Guest does not match the selected concierge conversation.");
      }
    }

    if (data.booking_id) {
      const { data: booking, error } = await context.supabase
        .from("bookings").select("id, property_id, guest_id")
        .eq("id", data.booking_id).eq("property_id", propertyId).maybeSingle();
      if (error || !booking) throw new Error("Booking not found in the active property.");
      if (data.guest_id && booking.guest_id && data.guest_id !== booking.guest_id) {
        throw new Error("Booking does not belong to the selected guest.");
      }
    }

    const category = data.category ?? categorizeGuestRequest(data.request_text);
    const { data: row, error } = await context.supabase
      .from("staynas_guest_requests")
      .insert({
        property_id: propertyId,
        session_id: data.session_id ?? null,
        booking_id: data.booking_id ?? null,
        guest_id: data.guest_id ?? null,
        category,
        request_text: data.request_text,
        intake_channel: data.intake_channel,
        priority: data.priority,
        guest_name: data.guest_name ?? null,
        guest_contact: data.guest_contact ?? null,
        requested_for: data.requested_for ?? null,
        created_by: context.userId,
      })
      .select("id, category, status, priority, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listGuestRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    status: z.enum(["received","triaged","assigned","in_progress","fulfilled","cancelled","escalated","all"]).default("all"),
    category: categorySchema.optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const propertyId = await activePropertyId(context.supabase, context.userId);
    const { data: rows, error } = await context.supabase
      .from("staynas_guest_requests")
      .select("id, session_id, booking_id, guest_id, category, request_text, intake_channel, status, priority, guest_name, guest_contact, requested_for, created_at, updated_at")
      .eq("property_id", propertyId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []).filter((row: any) =>
      (data.status === "all" || row.status === data.status) &&
      (!data.category || row.category === data.category)
    );
  });
