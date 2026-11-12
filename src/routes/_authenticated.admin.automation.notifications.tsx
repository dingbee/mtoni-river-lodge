import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyOperationalNotifications, transitionOperationalNotification } from "@/domains/automation/operational-notifications.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/automation/notifications")({
  head: () => ({ meta: [{ title: "Operational Notifications — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const listFn = useServerFn(listMyOperationalNotifications);
  const transitionFn = useServerFn(transitionOperationalNotification);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["os-notifications"], queryFn: () => listFn({ data: { limit: 100 } }) });
  const rows: any[] = (q.data as any) ?? [];
  const action = useMutation({
    mutationFn: (input: { deliveryId: string; action: "read" | "acknowledge" | "resolve" }) =>
      transitionFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["os-notifications"] }),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Operational Notification Centre" description="Property-scoped staff alerts with separate delivery, read, acknowledgement and resolution states." />
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading notifications…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No operational notifications for your active property.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((row) => {
            const event = Array.isArray(row.event) ? row.event[0] : row.event;
            return (
              <li key={row.id} className="space-y-3 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{event?.title ?? "Operational notification"}</div>
                    {event?.body && <div className="text-xs text-muted-foreground">{event.body}</div>}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {event?.module ?? "operations"} · {row.channel} · {new Date(row.created_at).toLocaleString()}
                    </div>
                  </div>
                  <span className={event?.severity === "critical" ? "text-xs font-semibold text-destructive" : "text-xs text-muted-foreground"}>
                    {event?.severity ?? "info"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">assigned · {row.status} · {row.read_at ? "read" : "unread"} · {row.acknowledged_at ? "acknowledged" : "not acknowledged"} · {row.resolved_at ? "resolved" : "open"}</span>
                  {!row.read_at && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ deliveryId: row.id, action: "read" })}>Mark read</Button>}
                  {!row.acknowledged_at && !row.resolved_at && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ deliveryId: row.id, action: "acknowledge" })}>Acknowledge</Button>}
                  {!row.resolved_at && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ deliveryId: row.id, action: "resolve" })}>Resolve</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
