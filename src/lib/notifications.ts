import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotificationKind =
  | "booking_created"
  | "payment_received"
  | "review_submitted"
  | "form_submission"
  | "room_maintenance"
  | "task_assigned"
  | "other";

export type OsNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  createdAt: string;
  read: boolean;
};

const NOTIF_QUERY_KEY = ["os-notifications"] as const;

function eventTypeToKind(evt: string): NotificationKind {
  if (evt.startsWith("booking")) return "booking_created";
  if (evt.startsWith("payment")) return "payment_received";
  if (evt.startsWith("review")) return "review_submitted";
  if (evt.startsWith("form")) return "form_submission";
  if (evt.startsWith("room") || evt.startsWith("maintenance")) return "room_maintenance";
  if (evt.startsWith("task")) return "task_assigned";
  return "other";
}

function titleFor(evt: string): string {
  return evt
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type PendingRow = {
  id: string;
  event_type: string;
  booking_id: string;
  created_at: string;
  processed_at: string | null;
  payload: unknown;
};

function toNotification(row: PendingRow): OsNotification {
  const payload = (row.payload && typeof row.payload === "object" ? row.payload : {}) as Record<
    string,
    unknown
  >;
  const body =
    typeof payload.summary === "string"
      ? payload.summary
      : typeof payload.message === "string"
        ? payload.message
        : undefined;
  return {
    id: row.id,
    kind: eventTypeToKind(row.event_type),
    title: titleFor(row.event_type),
    body,
    href: row.booking_id ? `/admin/bookings/${row.booking_id}` : undefined,
    createdAt: row.created_at,
    read: row.processed_at !== null,
  };
}

/**
 * Load recent notifications from the `pending_notifications` queue.
 * The panel subscribes to realtime inserts via `useRealtimeNotifications`.
 */
export function useNotifications() {
  return useQuery<OsNotification[]>({
    queryKey: NOTIF_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pending_notifications")
        .select("id, event_type, booking_id, created_at, processed_at, payload")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []).map((r) => toNotification(r as PendingRow));
    },
    staleTime: 30_000,
  });
}

/**
 * Subscribes to realtime inserts on `pending_notifications` and refreshes
 * the shared notifications query. Mount once at the admin shell level.
 */
export function useRealtimeNotifications() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("os-notifications")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_notifications" },
        () => {
          qc.invalidateQueries({ queryKey: NOTIF_QUERY_KEY });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}

export function useUnreadCount() {
  const { data = [] } = useNotifications();
  return data.filter((n) => !n.read).length;
}