import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CalendarEntryType = "journal" | "homepage" | "campaign" | "promotion" | "social" | "other";

export type CalendarEntryInput = {
  id?: string;
  entry_type: CalendarEntryType;
  title: string;
  scheduled_at: string;
  ends_at?: string | null;
  linked_type?: string | null;
  linked_id?: string | null;
  status?: string;
  notes?: string | null;
};

export const listCalendarEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("content_calendar_entries")
      .select("*")
      .order("scheduled_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

export const saveCalendarEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CalendarEntryInput) => d)
  .handler(async ({ data, context }) => {
    const payload = {
      entry_type: data.entry_type,
      title: data.title,
      scheduled_at: data.scheduled_at,
      ends_at: data.ends_at ?? null,
      linked_type: data.linked_type ?? null,
      linked_id: data.linked_id ?? null,
      status: data.status ?? "planned",
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("content_calendar_entries").update(payload).eq("id", data.id).select("*").single();
      if (error) throw error;
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("content_calendar_entries")
      .insert({ ...payload, owner: context.userId })
      .select("*").single();
    if (error) throw error;
    return row;
  });

export const rescheduleCalendarEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; scheduled_at: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("content_calendar_entries")
      .update({ scheduled_at: data.scheduled_at })
      .eq("id", data.id).select("*").single();
    if (error) throw error;
    return row;
  });

export const deleteCalendarEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("content_calendar_entries").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });