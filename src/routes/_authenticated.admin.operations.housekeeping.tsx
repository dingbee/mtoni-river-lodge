import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRoomBoard } from "@/lib/operations.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { RoomStateChip } from "@/components/os/operations/RoomStateChip";

export const Route = createFileRoute("/_authenticated/admin/operations/housekeeping")({
  head: () => ({ meta: [{ title: "Housekeeping — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: HousekeepingPage,
});

const COLUMNS: { title: string; states: string[] }[] = [
  { title: "Awaiting cleaning", states: ["vacant_dirty"] },
  { title: "Ready", states: ["vacant_clean"] },
  { title: "Inspection", states: ["inspection"] },
  { title: "Maintenance", states: ["maintenance", "out_of_service"] },
];

function HousekeepingPage() {
  const fn = useServerFn(getRoomBoard);
  const q = useQuery({ queryKey: ["ops-room-board"], queryFn: () => fn(), staleTime: 30_000 });
  const states: any[] = (q.data as any)?.states ?? [];
  return (
    <div className="space-y-4">
      <PageHeader title="Housekeeping" description="Board of every room by cleaning state." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((c) => {
          const items = states.filter((s) => c.states.includes(s.state));
          return (
            <div key={c.title} className="rounded-xl border bg-card p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">{c.title}</h3>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <ul className="space-y-2">
                {items.length === 0 ? <li className="text-xs text-muted-foreground">Nothing here.</li> : items.map((s) => (
                  <li key={s.id} className="rounded border p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{s.unit_label}</span>
                      <RoomStateChip state={s.state} />
                    </div>
                    <div className="text-xs text-muted-foreground">{s.room?.name}</div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">Update states from the Room Board. Mobile housekeeping app is on the roadmap.</p>
    </div>
  );
}