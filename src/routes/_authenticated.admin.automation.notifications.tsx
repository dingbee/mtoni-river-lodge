import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyNotifications, markNotificationRead } from "@/domains/automation/automation.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/automation/notifications")({
  head: () => ({ meta: [{ title: "Notifications — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const fn = useServerFn(listMyNotifications);
  const mark = useServerFn(markNotificationRead);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["awe-notifications"], queryFn: () => fn() });
  const rows: any[] = (q.data as any) ?? [];
  const m = useMutation({
    mutationFn: (id: string) => mark({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["awe-notifications"] }),
  });
  return (
    <div className="space-y-4">
      <PageHeader title="Notification Centre" description="In-app, email, WhatsApp, SMS — unified." />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notifications.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {rows.map((n) => (
            <li key={n.id} className={`flex items-start justify-between gap-3 p-3 text-sm ${n.read_at ? "opacity-60" : ""}`}>
              <div className="min-w-0">
                <div className="font-medium">{n.title}</div>
                {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                <div className="text-xs text-muted-foreground">{n.channel} · {new Date(n.created_at).toLocaleString()}</div>
              </div>
              {!n.read_at && <Button size="sm" variant="outline" onClick={() => m.mutate(n.id)}>Mark read</Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}