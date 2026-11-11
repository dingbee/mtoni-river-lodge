import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NotificationKind =
  | "booking_created"
  | "payment_received"
  | "review_submitted"
  | "form_submission"
  | "room_maintenance"
  | "task_assigned"
  | "guest_request"
  | "housekeeping_exception"
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

/**
 * Supabase Realtime channels are stateful: Postgres listeners must be
 * registered before subscribe(), and a joined channel cannot be reconfigured.
 * AdminShell can be mounted more than once during route error-boundary and
 * recovery transitions, so every hook instance must own a distinct topic.
 */
export function notificationChannelTopic(instanceId: string): string {
  const safeId = instanceId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new Error("A non-empty notification channel instance ID is required.");
  return `os-notifications-${safeId}`;
}

function eventTypeToKind(evt: string): NotificationKind {
  if (evt.startsWith("booking")) return "booking_created";
  if (evt.startsWith("payment")) return "payment_received";
  if (evt.startsWith("review")) return "review_submitted";
  if (evt.startsWith("form")) return "form_submission";
  if (evt.startsWith("room") || evt.startsWith("maintenance")) return "room_maintenance";
  if (evt.startsWith("task")) return "task_assigned";
  if (evt.startsWith("guest_request")) return "guest_request";
  return "other";
}

function titleFor(evt: string): string {
  return evt
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type HousekeepingNotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  read_at: string | null;
  created_at: string;
};

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
 * Load platform notifications and recipient-scoped housekeeping notifications.
 * Both streams remain protected by their respective RLS policies.
 */
export function useNotifications() {
  return useQuery<OsNotification[]>({
    queryKey: NOTIF_QUERY_KEY,
    queryFn: async () => {
      const [platformResult, housekeepingResult] = await Promise.all([
        supabase.from("pending_notifications")
          .select("id, event_type, booking_id, created_at, processed_at, payload")
          .order("created_at", { ascending: false }).limit(50),
        supabase.from("housekeeping_notifications")
          .select("id, kind, title, body, href, read_at, created_at")
          .order("created_at", { ascending: false }).limit(50),
      ]);
      if (platformResult.error) throw platformResult.error;
      if (housekeepingResult.error) throw housekeepingResult.error;
      const platform = (platformResult.data ?? []).map((row) => toNotification(row as PendingRow));
      const housekeeping = (housekeepingResult.data ?? []).map((row) => {
        const item = row as HousekeepingNotificationRow;
        return {
          id: "housekeeping:" + item.id,
          kind: "housekeeping_exception" as const,
          title: item.title,
          body: item.body ?? undefined,
          href: item.href ?? undefined,
          createdAt: item.created_at,
          read: item.read_at !== null,
        };
      });
      return [...platform, ...housekeeping]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 50);
    },
    staleTime: 30_000,
  });
}

/**
 * Subscribes to platform and housekeeping notification changes and refreshes the shared query.
 * Each mounted instance owns a unique channel; listeners are always attached
 * before subscribe(), and the channel is removed when that instance unmounts.
 */
export function useRealtimeNotifications() {
  const qc = useQueryClient();
  const instanceId = useId();
  const channelTopic = notificationChannelTopic(instanceId);

  useEffect(() => {
    let active = true;
    const channel = supabase
      .channel(channelTopic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pending_notifications" },
        () => {
          if (active) void qc.invalidateQueries({ queryKey: NOTIF_QUERY_KEY });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "housekeeping_notifications" },
        () => {
          if (active) void qc.invalidateQueries({ queryKey: NOTIF_QUERY_KEY });
        },
      )
      .subscribe((status, error) => {
        if (!active) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Realtime is an enhancement; the query remains available via normal fetch/refetch.
          console.warn("[os-notifications] realtime subscription degraded", error);
        }
      });

    return () => {
      active = false;
      // removeChannel is asynchronous; unique per-instance topics prevent a
      // rapid remount from trying to register listeners on a channel being removed.
      void supabase.removeChannel(channel);
    };
  }, [channelTopic, qc]);
}

export function useUnreadCount() {
  const { data = [] } = useNotifications();
  return data.filter((n) => !n.read).length;
}
