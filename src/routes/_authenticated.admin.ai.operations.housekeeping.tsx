import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { getHousekeepingPriorities } from "@/domains/ai/operations/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/ai/operations/housekeeping")({
  component: HousekeepingIntelligence,
});

function HousekeepingIntelligence() {
  const fn = useServerFn(getHousekeepingPriorities);
  const q = useQuery({ queryKey: ["ops-hk-priorities"], queryFn: () => fn({ data: undefined as any }) });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Housekeeping Intelligence"
        description="AI-suggested cleaning priority — housekeeping controls execution."
      />
      <SectionCard title="Priority order for today">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.data && q.data.length > 0 ? (
          <ul className="space-y-3 text-sm">
            {q.data.map((p: any) => (
              <li key={p.booking_id} className="rounded border p-3">
                <div className="flex justify-between gap-3">
                  <div className="font-medium">{p.room_name}</div>
                  <span className="text-xs text-muted-foreground">Score {p.score}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{p.reasoning}</div>
                {p.next_arrival && (
                  <div className="mt-1 text-xs">
                    Next arrival: <b>{p.next_arrival.guest_name}</b>
                    {p.next_arrival.is_priority && " · priority"}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No turnovers today.</p>
        )}
      </SectionCard>
    </div>
  );
}