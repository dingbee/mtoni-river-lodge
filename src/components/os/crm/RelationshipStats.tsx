import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGuestMetrics } from "@/lib/guest-intelligence.functions";

export function RelationshipStats({ guestId }: { guestId: string }) {
  const fn = useServerFn(getGuestMetrics);
  const q = useQuery({
    queryKey: ["guest-metrics", guestId],
    queryFn: () => fn({ data: { id: guestId } }),
  });
  const m = (q.data as any) ?? {};
  const items: Array<[string, string]> = [
    ["Repeat", m.is_repeat ? "Yes" : "No"],
    ["Avg nights", String(m.avg_nights ?? 0)],
    ["Avg spend", `$${Number(m.avg_spend ?? 0).toLocaleString()}`],
    ["Avg party", String(m.avg_party_size ?? 0)],
    ["Lead time", `${m.avg_lead_time_days ?? 0} d`],
    ["Cancellations", `${m.cancellation_rate ?? 0}%`],
    ["Favourite room", m.favouriteRoom?.name ?? "—"],
    ["Favourite experience", m.favourite_experience ?? "—"],
  ];
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Relationship intelligence</h3>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {items.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate text-right font-medium" title={value}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}