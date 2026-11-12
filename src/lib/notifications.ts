import { useEffect, useId } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMyOperationalNotifications } from "@/domains/automation/operational-notifications.functions";

export type NotificationKind = string;

export type OsNotification = {
  id: string;
  deliveryId: string;
  assignedAt: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  createdAt: string;
  severity: "info" | "warning" | "critical";
  read: boolean;
  acknowledged: boolean;
  resolved: boolean;
};

const NOTIF_QUERY_KEY = ["os-notifications"] as const;

export function notificationChannelTopic(instanceId: string): string {
  const safeId = instanceId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new Error("A non-empty notification channel instance ID is required.");
  return `os-notifications-${safeId}`;
}

/** One source of truth: recipient-scoped operational notification deliveries. */
export function useNotifications() {
  const listFn = useServerFn(listMyOperationalNotifications);
  return useQuery<OsNotification[]>({
    queryKey: NOTIF_QUERY_KEY,
    queryFn: async () => {
      const rows = await listFn({ data: { limit: 50 } });
      return (rows as any[]).map((row) => {
        const event = Array.isArray(row.event) ? row.event[0] : row.event;
        return {
          id: row.id,
          deliveryId: row.id,
          assignedAt: row.assigned_at,
          kind: event?.event_type ?? "operational",
          title: event?.title ?? "Operational notification",
          body: event?.body ?? undefined,
          href: event?.href ?? undefined,
          createdAt: row.created_at,
          severity: event?.severity ?? "info",
          read: row.read_at !== null,
          acknowledged: row.acknowledged_at !== null,
          resolved: row.resolved_at !== null,
        } as OsNotification;
      });
    },
    staleTime: 15_000,
  });
}

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
        { event: "*", schema: "public", table: "operational_notification_deliveries" },
        () => {
          if (active) void qc.invalidateQueries({ queryKey: NOTIF_QUERY_KEY });
        },
      )
      .subscribe((status, error) => {
        if (!active) return;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[os-notifications] realtime subscription degraded", error);
        }
      });

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [channelTopic, qc]);
}

export function useUnreadCount() {
  const { data = [] } = useNotifications();
  return data.filter((notification) => !notification.read).length;
}
