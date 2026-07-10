import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "./EmptyState";
import { Bell } from "lucide-react";
import { useNotifications } from "@/lib/notifications";

export function NotificationsPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data = [], isLoading } = useNotifications();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Notifications</SheetTitle>
        </SheetHeader>
        <div className="mt-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="No notifications"
              description="You're all caught up. Realtime updates arrive in Sprint 2."
            />
          ) : (
            <ul className="space-y-2">
              {data.map((n) => (
                <li key={n.id} className="rounded-md border border-border p-3 text-sm">
                  <p className="font-medium text-foreground">{n.title}</p>
                  {n.body && <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}