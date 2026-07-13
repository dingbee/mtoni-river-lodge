import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getGuestExperiences } from "@/lib/guest-intelligence.functions";

export function ExperiencesList({ guestId }: { guestId: string }) {
  const fn = useServerFn(getGuestExperiences);
  const q = useQuery({
    queryKey: ["guest-experiences", guestId],
    queryFn: () => fn({ data: { id: guestId } }),
  });
  if (q.isLoading) return <p className="text-sm text-muted-foreground">Loading experiences…</p>;
  const rows = ((q.data as any[]) ?? []);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No experiences booked yet.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border bg-card">
      {rows.map((e: any) => (
        <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
          <div className="flex-1">
            <div className="font-medium">{e.name}</div>
            <div className="text-xs text-muted-foreground">
              {e.booking?.reference ?? ""} · {e.booking?.check_in ? new Date(e.booking.check_in).toLocaleDateString() : ""}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">×{e.quantity}</div>
          <div className="tabular-nums">${e.line_total.toLocaleString()}</div>
        </li>
      ))}
    </ul>
  );
}