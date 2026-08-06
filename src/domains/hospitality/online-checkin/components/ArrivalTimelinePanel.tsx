import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionCard } from "@/components/os/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusChip } from "@/components/os/StatusChip";
import { getArrivalTimeline } from "../services/arrival-intelligence.functions";

type Entry = { id: string; at: string; action: string; source: string; actor: string | null };

function label(action: string) {
  return action
    .replace(/^arrival\.automation\./, "automation: ")
    .replace(/^automation_/, "automation: ")
    .replace(/[._]/g, " ");
}

export function ArrivalTimelinePanel({ bookingId }: { bookingId: string }) {
  const fn = useServerFn(getArrivalTimeline);
  const query = useQuery({
    queryKey: ["arrival-timeline", bookingId],
    queryFn: () => fn({ data: { bookingId } }) as Promise<Entry[]>,
    staleTime: 15_000,
  });

  return (
    <SectionCard
      title="Arrival timeline"
      description="Check-in, arrival pass, automation and staff actions from the existing activity logs."
    >
      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !query.data?.length ? (
        <p className="text-sm text-muted-foreground">No timeline entries yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {query.data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
              <StatusChip tone={e.source === "automation" ? "info" : "neutral"}>
                {e.source}
              </StatusChip>
              <span className="font-medium capitalize">{label(e.action)}</span>
              {e.actor && <span className="text-xs text-muted-foreground">{e.actor}</span>}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(e.at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
