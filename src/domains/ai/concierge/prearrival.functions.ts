import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(sb: any, userId: string) {
  const { data, error } = await sb.rpc("is_any_staff", { _user_id: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

// Upcoming arrivals with AI-derived preparation suggestions.
// AI SUGGESTS only — never sends messages automatically.
export const listPreArrivalGuests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const sb: any = context.supabase;
    const today = new Date();
    const in14 = new Date(today);
    in14.setDate(in14.getDate() + 14);
    const iso = (d: Date) => d.toISOString().slice(0, 10);

    const { data: bookings, error } = await sb
      .from("bookings")
      .select("id, reference, guest_name, guest_id, check_in, check_out, adults, children, special_requests")
      .gte("check_in", iso(today))
      .lte("check_in", iso(in14))
      .neq("status", "cancelled")
      .order("check_in", { ascending: true });
    if (error) throw new Error(error.message);

    const guestIds = Array.from(new Set((bookings ?? []).map((b: Record<string, unknown>) => b.guest_id).filter(Boolean)));
    const memMap = new Map<string, unknown[]>();
    if (guestIds.length > 0) {
      const { data: mems } = await sb
        .from("ai_guest_memories")
        .select("guest_id, memory_type, memory_key, memory_value")
        .in("guest_id", guestIds)
        .eq("status", "approved");
      for (const m of mems ?? []) {
        const arr = memMap.get((m as any).guest_id) ?? [];
        arr.push(m);
        memMap.set((m as any).guest_id, arr);
      }
    }

    return (bookings ?? []).map((b: Record<string, unknown>) => {
      const memories = b.guest_id ? memMap.get(b.guest_id) ?? [] : [];
      const suggestions: string[] = [];
      if (memories.some((m: Record<string, unknown>) => m.memory_key === "preference.room.river_facing"))
        suggestions.push("Confirm river-facing allocation if inventory allows.");
      if (memories.some((m: Record<string, unknown>) => m.memory_key === "preference.ambience.quiet"))
        suggestions.push("Flag quiet placement — avoid rooms near main path.");
      if (memories.some((m: Record<string, unknown>) => m.memory_type === "interest"))
        suggestions.push("Guest may appreciate early activity planning.");
      if ((b.children ?? 0) > 0)
        suggestions.push("Prepare family welcome (extra towels, activity guide).");
      if (/kilimanjaro|climb|trek/i.test(b.special_requests ?? ""))
        suggestions.push("Confirm early breakfast and trek transport.");
      return {
        booking_id: b.id,
        reference: b.reference,
        guest_id: b.guest_id,
        guest_name: b.guest_name,
        check_in: b.check_in,
        check_out: b.check_out,
        adults: b.adults,
        children: b.children,
        memories,
        suggestions,
      };
    });
  });