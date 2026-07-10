import { useQuery } from "@tanstack/react-query";

export type NotificationKind =
  | "booking_created"
  | "payment_received"
  | "review_submitted"
  | "form_submission"
  | "room_maintenance"
  | "task_assigned";

export type OsNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  href?: string;
  createdAt: string;
  read: boolean;
};

// TODO(sprint-2): back with a realtime subscription to public.pending_notifications
export function useNotifications() {
  return useQuery<OsNotification[]>({
    queryKey: ["os-notifications"],
    queryFn: async () => [],
    staleTime: 60_000,
  });
}

export function useUnreadCount() {
  const { data = [] } = useNotifications();
  return data.filter((n) => !n.read).length;
}