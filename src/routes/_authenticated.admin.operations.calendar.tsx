import { useState, useMemo } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOpsCalendar } from "@/lib/operations.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/operations/calendar")({
  head: () => ({ meta: [{ title: "Room Calendar — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CalendarPage,
});

type View = "day" | "week" | "month";

function CalendarPage() {
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);
  const fn = useServerFn(getOpsCalendar);
  const q = useQuery({
    queryKey: ["ops-calendar", view, range.from, range.to],
    queryFn: () => fn({ data: { from: range.from, to: range.to } }),
    staleTime: 60_000,
  });
  const d: any = q.data ?? { rooms: [], bookings: [], inventory: [] };
  const days = daysBetween(range.from, range.to);

  return (
    <div className="space-y-4">
      <PageHeader title="Room Calendar" description="Availability, blocks, and bookings across every room." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border p-0.5 text-xs">
          {(["day","week","month"] as View[]).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded px-2 py-1 capitalize ${view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {v}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setAnchor(shift(anchor, view, -1))}>◀</Button>
        <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>Today</Button>
        <Button size="sm" variant="outline" onClick={() => setAnchor(shift(anchor, view, 1))}>▶</Button>
        <span className="text-sm text-muted-foreground">{range.from} → {range.to}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="bg-muted/40">
              <th className="sticky left-0 z-10 border-r bg-muted/40 px-2 py-1 text-left">Room</th>
              {days.map((d) => (<th key={d} className="border-r px-2 py-1 text-center whitespace-nowrap">{d.slice(5)}</th>))}
            </tr>
          </thead>
          <tbody>
            {d.rooms.map((r: any) => (
              <tr key={r.id}>
                <td className="sticky left-0 z-10 border-r bg-card px-2 py-1 font-medium">{r.name}</td>
                {days.map((day) => {
                  const b = d.bookings.find((bk: any) => bk.room_id === r.id && bk.check_in <= day && bk.check_out > day);
                  const inv = d.inventory.find((i: any) => i.room_id === r.id && i.date === day);
                  const blocked = inv?.is_blocked;
                  return (
                    <td key={day} className={`border-r px-1 py-1 text-center ${blocked ? "bg-rose-500/10" : b ? "bg-blue-500/10" : ""}`}>
                      {b ? (
                        <Link to="/admin/operations/reservations/$id" params={{ id: b.id }} className="block truncate text-[10px] hover:underline">{b.guest_name.split(" ")[0]}</Link>
                      ) : blocked ? "×" : (inv ? inv.available_units : r.total_units)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Drag-and-drop reassignment coming soon.</p>
    </div>
  );
}

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function shift(d: Date, view: View, dir: number) {
  const n = new Date(d);
  if (view === "day") n.setDate(n.getDate() + dir);
  else if (view === "week") n.setDate(n.getDate() + dir * 7);
  else n.setMonth(n.getMonth() + dir);
  return n;
}
function rangeFor(view: View, anchor: Date) {
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (view === "day") { end.setDate(end.getDate() + 1); }
  else if (view === "week") {
    const dow = start.getDay(); start.setDate(start.getDate() - dow);
    end.setTime(start.getTime()); end.setDate(end.getDate() + 7);
  } else { start.setDate(1); end.setMonth(start.getMonth() + 1); end.setDate(1); }
  return { from: iso(start), to: iso(end) };
}
function daysBetween(from: string, to: string) {
  const out: string[] = []; const s = new Date(from); const e = new Date(to);
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}
