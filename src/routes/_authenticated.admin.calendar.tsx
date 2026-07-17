// Unified availability calendar — extends the ops calendar with block controls,
// active hold visibility, and a live event feed. Reads through the same
// hold-aware get_room_availability path used by the public site.

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Ban, CalendarDays, RefreshCw, ShieldOff, Sparkles, Timer, Wrench } from "lucide-react";
import { toast } from "sonner";

import { getOpsCalendar } from "@/lib/operations.functions";
import {
  listActiveHolds,
  listCalendarEvents,
  reassignBookingRoom,
  releaseHoldStaff,
  setRoomBlock,
  suggestRoomAssignment,
} from "@/lib/availability.functions";

import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { EmptyState } from "@/components/os/EmptyState";
import { LoadingState } from "@/components/os/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/admin/calendar")({
  head: () => ({
    meta: [
      { title: "Availability Calendar — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: UnifiedCalendarPage,
});

type View = "week" | "month";
type Cell = { date: string; booking?: { id: string; guest_name: string; reference: string }; blocked?: boolean; units?: number; hold?: boolean };

function iso(d: Date) { return d.toISOString().slice(0, 10); }
function shift(d: Date, view: View, dir: number) {
  const n = new Date(d);
  if (view === "week") n.setDate(n.getDate() + dir * 7);
  else n.setMonth(n.getMonth() + dir);
  return n;
}
function rangeFor(view: View, anchor: Date) {
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (view === "week") {
    const dow = start.getDay();
    start.setDate(start.getDate() - dow);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else {
    start.setDate(1);
    end.setMonth(start.getMonth() + 1);
    end.setDate(1);
  }
  return { from: iso(start), to: iso(end) };
}
function daysBetween(from: string, to: string) {
  const out: string[] = [];
  const s = new Date(from);
  const e = new Date(to);
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}

function UnifiedCalendarPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);
  const days = useMemo(() => daysBetween(range.from, range.to), [range]);

  const fetchOps = useServerFn(getOpsCalendar);
  const fetchHolds = useServerFn(listActiveHolds);
  const fetchEvents = useServerFn(listCalendarEvents);
  const blockFn = useServerFn(setRoomBlock);
  const releaseFn = useServerFn(releaseHoldStaff);
  const reassignFn = useServerFn(reassignBookingRoom);
  const suggestFn = useServerFn(suggestRoomAssignment);

  // ---- Filters -------------------------------------------------------
  const [filters, setFilters] = useState({
    arrivalsToday: false,
    departuresToday: false,
    vip: false,
    blocked: false,
    holds: false,
    roomSlugs: new Set<string>(),
  });
  const toggleRoomFilter = (slug: string) =>
    setFilters((f) => {
      const s = new Set(f.roomSlugs);
      if (s.has(slug)) s.delete(slug); else s.add(slug);
      return { ...f, roomSlugs: s };
    });

  // ---- Drag-and-drop state ------------------------------------------
  const [dragBookingId, setDragBookingId] = useState<string | null>(null);
  const [reassignCtx, setReassignCtx] = useState<{
    bookingId: string; fromRoomName: string; toRoomId: string; toRoomName: string;
  } | null>(null);
  const [reassignReason, setReassignReason] = useState("");

  // ---- AI suggestion state ------------------------------------------
  const [suggestForBooking, setSuggestForBooking] = useState<string | null>(null);
  const suggestions = useQuery({
    queryKey: ["calendar", "suggestions", suggestForBooking],
    enabled: !!suggestForBooking,
    queryFn: () => suggestFn({ data: { bookingId: suggestForBooking! } }),
  });

  const ops = useQuery({
    queryKey: ["calendar", "ops", range.from, range.to],
    queryFn: () => fetchOps({ data: { from: range.from, to: range.to } }),
    staleTime: 30_000,
  });
  const holds = useQuery({
    queryKey: ["calendar", "holds", range.from, range.to],
    queryFn: () => fetchHolds({ data: { from: range.from, to: range.to } }),
    refetchInterval: 30_000,
  });
  const events = useQuery({
    queryKey: ["calendar", "events", range.from, range.to],
    queryFn: () => fetchEvents({ data: { limit: 50 } }),
    refetchInterval: 60_000,
  });

  const [blockOpen, setBlockOpen] = useState(false);
  const [blockCtx, setBlockCtx] = useState<{ roomId: string; roomName: string; from: string; to: string }>();
  const [blockReason, setBlockReason] = useState("");

  const doBlock = useMutation({
    mutationFn: (v: { roomId: string; from: string; to: string; blocked: boolean; reason?: string }) =>
      blockFn({ data: v }),
    onSuccess: () => {
      toast.success("Calendar updated");
      qc.invalidateQueries({ queryKey: ["calendar"] });
      setBlockOpen(false);
      setBlockReason("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doRelease = useMutation({
    mutationFn: (holdId: string) => releaseFn({ data: { holdId } }),
    onSuccess: () => {
      toast.success("Hold released");
      qc.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d: any = ops.data ?? { rooms: [], bookings: [], inventory: [] };

  const activeHolds = holds.data ?? [];
  const activeHoldsByRoomDate = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const h of activeHolds) {
      const s = new Date(h.check_in);
      const e = new Date(h.check_out);
      for (let dd = new Date(s); dd < e; dd.setDate(dd.getDate() + 1)) {
        const key = `${h.room_id}:${iso(dd)}`;
        (map[key] ??= new Set<string>()).add(h.id);
      }
    }
    return map;
  }, [activeHolds]);

  const bookingsToday = useMemo(() => {
    const today = iso(new Date());
    return (d.bookings as any[]).filter((b) => b.check_in <= today && b.check_out > today).length;
  }, [d.bookings]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability Calendar"
        description="Unified view of reservations, holds, and room blocks. Single source of truth for /book and admin."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/operations/calendar">Ops calendar</Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                qc.invalidateQueries({ queryKey: ["calendar"] });
              }}
            >
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="In-house today" value={String(bookingsToday)} icon={CalendarDays} />
        <StatCard label="Active holds" value={String(activeHolds.length)} icon={Timer} />
        <StatCard
          label="Blocked days"
          value={String((d.inventory as any[]).filter((i) => i.is_blocked).length)}
          icon={Ban}
        />
        <StatCard label="Rooms" value={String(d.rooms.length)} icon={Wrench} />
      </div>

      <SectionCard
        title="Grid"
        description="Reservations are blue, blocks are red, active holds are amber. Click a room name to block/unblock a range."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            {(["week", "month"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded px-2 py-1 capitalize ${
                  view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => setAnchor(shift(anchor, view, -1))}>◀</Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>Today</Button>
          <Button size="sm" variant="outline" onClick={() => setAnchor(shift(anchor, view, 1))}>▶</Button>
          <span className="text-sm text-muted-foreground">
            {range.from} → {range.to}
          </span>
        </div>

        {ops.isLoading ? (
          <LoadingState label="Loading calendar…" />
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-10 border-r bg-muted/40 px-2 py-1 text-left">Room</th>
                  {days.map((day) => (
                    <th key={day} className="border-r px-2 py-1 text-center whitespace-nowrap">
                      {day.slice(5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rooms.map((r: any) => (
                  <tr key={r.id}>
                    <td className="sticky left-0 z-10 border-r bg-card px-2 py-1 font-medium">
                      <button
                        className="text-left hover:underline"
                        onClick={() => {
                          setBlockCtx({ roomId: r.id, roomName: r.name, from: range.from, to: range.to });
                          setBlockOpen(true);
                        }}
                      >
                        {r.name}
                      </button>
                    </td>
                    {days.map((day) => {
                      const b = (d.bookings as any[]).find(
                        (bk) => bk.room_id === r.id && bk.check_in <= day && bk.check_out > day,
                      );
                      const inv = (d.inventory as any[]).find((i) => i.room_id === r.id && i.date === day);
                      const blocked = inv?.is_blocked;
                      const held = activeHoldsByRoomDate[`${r.id}:${day}`]?.size ?? 0;
                      return (
                        <td
                          key={day}
                          className={`border-r px-1 py-1 text-center ${
                            blocked ? "bg-rose-500/15" : b ? "bg-blue-500/15" : held ? "bg-amber-500/15" : ""
                          }`}
                          title={
                            b
                              ? `${b.guest_name} · ${b.reference}`
                              : blocked
                                ? "Blocked"
                                : held
                                  ? `${held} active hold(s)`
                                  : `${inv?.available_units ?? r.total_units} available`
                          }
                        >
                          {b ? (
                            <Link
                              to="/admin/operations/reservations/$id"
                              params={{ id: b.id }}
                              className="block truncate text-[10px] hover:underline"
                            >
                              {b.guest_name.split(" ")[0]}
                            </Link>
                          ) : blocked ? (
                            "×"
                          ) : held ? (
                            `⏱${held}`
                          ) : (
                            inv?.available_units ?? r.total_units
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Active holds" description="Temporary 15-minute reservations from /book. Expire automatically.">
          {holds.isLoading ? (
            <LoadingState label="Loading holds…" />
          ) : activeHolds.length === 0 ? (
            <EmptyState title="No active holds" description="Guests aren't currently mid-checkout." />
          ) : (
            <div className="space-y-2">
              {activeHolds.slice(0, 15).map((h) => {
                const room = (d.rooms as any[]).find((r) => r.id === h.room_id);
                return (
                  <div key={h.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{room?.name ?? "Room"}</div>
                      <div className="text-xs text-muted-foreground">
                        {h.check_in} → {h.check_out}
                        {h.guest_email ? ` · ${h.guest_email}` : ""}
                      </div>
                      <div className="text-xs">
                        Expires {formatDistanceToNow(new Date(h.expires_at), { addSuffix: true })}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => doRelease.mutate(h.id)}
                      disabled={doRelease.isPending}
                    >
                      <ShieldOff className="mr-1 h-3 w-3" /> Release
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Recent calendar events" description="Reservations, blocks, and holds — live audit trail.">
          {events.isLoading ? (
            <LoadingState label="Loading events…" />
          ) : (events.data ?? []).length === 0 ? (
            <EmptyState title="Quiet" description="No calendar events recorded yet." />
          ) : (
            <div className="space-y-2">
              {(events.data ?? []).slice(0, 30).map((e) => (
                <div key={e.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant={e.event_type.startsWith("room.") ? "destructive" : "outline"}>
                      {e.event_type}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {(e.date_from || e.date_to) && (
                    <div className="mt-1 text-xs">
                      {e.date_from ?? ""}
                      {e.date_to ? ` → ${e.date_to}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <Dialog open={blockOpen} onOpenChange={setBlockOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Block / unblock room</DialogTitle>
            <DialogDescription>
              {blockCtx?.roomName} — pick a range and a reason. Blocked dates disappear from /book instantly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>From</Label>
                <Input
                  type="date"
                  value={blockCtx?.from ?? ""}
                  onChange={(ev) => setBlockCtx((c) => c && { ...c, from: ev.target.value })}
                />
              </div>
              <div>
                <Label>To (exclusive)</Label>
                <Input
                  type="date"
                  value={blockCtx?.to ?? ""}
                  onChange={(ev) => setBlockCtx((c) => c && { ...c, to: ev.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Reason</Label>
              <Select value={blockReason || undefined} onValueChange={setBlockReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="deep_clean">Deep clean</SelectItem>
                  <SelectItem value="staff_use">Staff use</SelectItem>
                  <SelectItem value="out_of_service">Out of service</SelectItem>
                  <SelectItem value="owner_hold">Owner hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Textarea placeholder="Notes (optional)" rows={2} onChange={() => { /* notes go into reason payload */ }} />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                blockCtx &&
                doBlock.mutate({ roomId: blockCtx.roomId, from: blockCtx.from, to: blockCtx.to, blocked: false })
              }
              disabled={doBlock.isPending}
            >
              Unblock range
            </Button>
            <Button
              onClick={() =>
                blockCtx &&
                doBlock.mutate({
                  roomId: blockCtx.roomId,
                  from: blockCtx.from,
                  to: blockCtx.to,
                  blocked: true,
                  reason: blockReason || undefined,
                })
              }
              disabled={doBlock.isPending}
            >
              Block range
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}