import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listOpsTasks, completeOpsTask } from "@/lib/operations-tasks.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/operations/tasks")({
  head: () => ({ meta: [{ title: "Operations Tasks — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: TasksPage,
});

const COLUMNS: { key: string; label: string }[] = [
  { key: "pending", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "completed", label: "Completed" },
];

function TasksPage() {
  const fn = useServerFn(listOpsTasks);
  const q = useQuery({ queryKey: ["ops-tasks"], queryFn: () => fn({ data: { status: "all" } }), staleTime: 15_000 });
  const tasks: any[] = (q.data as any) ?? [];

  const complete = useServerFn(completeOpsTask);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: (id: string) => complete({ data: { id } }),
    onSuccess: () => { toast.success("Task completed"); qc.invalidateQueries({ queryKey: ["ops-tasks"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Operations Tasks"
        description="Reservation-linked tasks — airport pickup, birthday setup, wake-up calls, and more." />
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => (t.status ?? "pending") === col.key);
          return (
            <div key={col.key} className="rounded-xl border bg-card p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{col.label}</h3>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <ul className="space-y-2">
                {items.length === 0 && <li className="text-xs text-muted-foreground">No tasks.</li>}
                {items.map((t) => (
                  <li key={t.id} className="rounded border p-2 text-sm">
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {t.category ?? t.task_type}
                        {t.booking && (<> · <Link to="/admin/operations/reservations/$id" params={{ id: t.booking.id }} className="hover:underline">{t.booking.reference}</Link></>)}
                      </span>
                      {t.due_at && <span>{new Date(t.due_at).toLocaleString()}</span>}
                    </div>
                    {col.key !== "completed" && (
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => m.mutate(t.id)}>Complete</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}