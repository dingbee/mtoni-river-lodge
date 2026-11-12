import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "./EmptyState";
import { Bell, Check, CheckCheck, CircleCheck } from "lucide-react";
import { useNotifications } from "@/lib/notifications";
import { transitionOperationalNotification } from "@/domains/automation/operational-notifications.functions";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export function NotificationsPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data = [], isLoading } = useNotifications();
  const transitionFn = useServerFn(transitionOperationalNotification);
  const qc = useQueryClient();
  const transition = useMutation({
    mutationFn: (input: { deliveryId: string; action: "read" | "acknowledge" | "resolve" }) =>
      transitionFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["os-notifications"] }),
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Operational notifications</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications"
              description="Operational alerts for your active property will appear here."
            />
          ) : (
            <ul className="space-y-2">
              {data.map((notification) => (
                <li key={notification.deliveryId} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground">{notification.title}</p>
                    <span className={notification.severity === "critical" ? "text-destructive text-xs font-semibold" : "text-xs text-muted-foreground"}>
                      {notification.severity}
                    </span>
                  </div>
                  {notification.body && <p className="mt-1 text-xs text-muted-foreground">{notification.body}</p>}
                  {notification.href?.startsWith("/") && !notification.href.startsWith("//") && (
                    <a href={notification.href} className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline">
                      Open related record
                    </a>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">Assigned {new Date(notification.assignedAt).toLocaleString()} · Received {new Date(notification.createdAt).toLocaleString()}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!notification.read && (
                      <Button size="sm" variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({ deliveryId: notification.deliveryId, action: "read" })}>
                        <Check className="mr-1 size-3" /> Read
                      </Button>
                    )}
                    {!notification.acknowledged && !notification.resolved && (
                      <Button size="sm" variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({ deliveryId: notification.deliveryId, action: "acknowledge" })}>
                        <CheckCheck className="mr-1 size-3" /> Acknowledge
                      </Button>
                    )}
                    {!notification.resolved && (
                      <Button size="sm" variant="outline" disabled={transition.isPending} onClick={() => transition.mutate({ deliveryId: notification.deliveryId, action: "resolve" })}>
                        <CircleCheck className="mr-1 size-3" /> Resolve
                      </Button>
                    )}
                    {notification.resolved && <span className="text-xs text-muted-foreground">Resolved</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
