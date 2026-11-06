// Unified availability calendar — extends the ops calendar with block controls,
// active hold visibility, and a live event feed. Reads through the same
// hold-aware get_room_availability path used by the public site.

import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { Ban, CalendarDays, RefreshCw, ShieldOff, Timer } from "lucide-react";
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
import { DatePickerField } from "@/components/os/DatePickerField";

export const Route = createFileRoute("/_authenticated/admin/calendar")({
  head: () => ({
    meta: [
      { title: "Reservations Calendar — StayNas" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: UnifiedCalendarPage,
});

type View = "week" | "month";

type BookingLaneItem = { booking: any; start: number; end: number };
function buildBookingLanes(bookings: any[], from: string, dayCount: number): BookingLaneItem[][] {
  const startMs = Date.parse(`${from}T00:00:00Z`);
  const lanes: Array<{ end: number; items: BookingLaneItem[] }> = [];
  const ordered = [...bookings].sort((a, b) =>
    a.check_in.localeCompare(b.check_in) || a.check_out.localeCompare(b.check_out),
  );
  for (const booking of ordered) {
    const start = Math.max(0, Math.floor((Date.parse(`${booking.check_in}T00:00:00Z`) - startMs) / 86_400_000));
    const end = Math.min(dayCount, Math.ceil((Date.parse(`${booking.check_out}T00:00:00Z`) - startMs) / 86_400_000));
    if (end <= start) continue;
    let lane = lanes.find((candidate) => candidate.end <= start);
    if (!lane) {
      lane = { end: 0, items: [] };
      lanes.push(lane);
    }
    lane.end = end;
    lane.items.push({ booking, start, end });
  }
  return lanes.map((lane) => lane.items);
}

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

  const doReassign = useMutation({
    mutationFn: (v: { bookingId: string; newRoomId: string; reason?: string }) =>
      reassignFn({ data: v }),
    onSuccess: () => {
      toast.success("Booking reassigned — inventory & audit updated");
      qc.invalidateQueries({ queryKey: ["calendar"] });
      setReassignCtx(null);
      setReassignReason("");
      setSuggestForBooking(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d: any = ops.data ?? { rooms: [], bookings: [], inventory: [] };

  const activeHolds = holds.data ?? [];
  const bookingsToday = useMemo(() => {
    const today = iso(new Date());
    return (d.bookings as any[]).filter((b) => b.check_in <= today && b.check_out > today).length;
  }, [d.bookings]);

  // Derived views after filter application.
  const today = iso(new Date());
  const visibleBookings = useMemo(() => {
    return (d.bookings as any[]).filter((b) => {
      if (filters.holds) return false;
      if (filters.arrivalsToday && b.check_in !== today) return false;
      if (filters.departuresToday && b.check_out !== today) return false;
      if (filters.vip) {
        const gt = (b.guest_type || "").toString();
        if (gt !== "vip" && gt !== "climber") return false;
      }
      return true;
    });
  }, [d.bookings, filters, today]);

  const visibleRooms = useMemo(() => {
    const rooms = (d.rooms as any[]);
    if (filters.roomSlugs.size === 0) return rooms;
    return rooms.filter((r) => filters.roomSlugs.has(r.slug));
  }, [d.rooms, filters.roomSlugs]);

  const arrivalsCount = (d.bookings as any[]).filter((b) => b.check_in === today).length;
  const departuresCount = (d.bookings as any[]).filter((b) => b.check_out === today).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reservations Calendar"
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
        <StatCard label="Arrivals today" value={String(arrivalsCount)} icon={CalendarDays} />
        <StatCard label="Departures today" value={String(departuresCount)} icon={CalendarDays} />
        <StatCard
          label="Blocked days"
          value={String((d.inventory as any[]).filter((i) => i.is_blocked).length)}
          icon={Ban}
        />
      </div>

      <SectionCard title="Filters" description="Narrow the calendar and stat cards.">
        <div className="flex flex-wrap items-center gap-3">
          {[
            { k: "arrivalsToday" as const, label: "Arrivals today" },
            { k: "departuresToday" as const, label: "Departures today" },
            { k: "vip" as const, label: "VIP / climbers" },
            { k: "holds" as const, label: "Show holds only" },
          ].map((f) => (
            <label key={f.k} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={filters[f.k]}
                onCheckedChange={(v) => setFilters((s) => ({ ...s, [f.k]: Boolean(v) }))}
              />
              {f.label}
            </label>
          ))}
          <div className="ml-4 flex flex-wrap items-center gap-1 text-xs">
            <span className="text-muted-foreground mr-1">Rooms:</span>
            {(d.rooms as any[]).map((r) => (
              <button
                key={r.id}
                onClick={() => toggleRoomFilter(r.slug)}
                className={`rounded-full border px-2 py-0.5 ${
                  filters.roomSlugs.has(r.slug)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground"
                }`}
              >
                {r.name}
              </button>
            ))}
            {filters.roomSlugs.size > 0 && (
              <button
                onClick={() => setFilters((s) => ({ ...s, roomSlugs: new Set() }))}
                className="ml-2 text-muted-foreground hover:underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Room-by-room reservation schedule"
        description="Reservations span their actual check-in and check-out dates. Overlapping stays occupy separate lanes. Select a booking for details, or drag it to another room."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/20 p-2 sm:border-0 sm:bg-transparent sm:p-0">
          <div className="inline-flex rounded-xl border border-border bg-muted/40 p-1 text-xs">
            {(["week", "month"] as View[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`min-h-9 rounded-lg px-3 py-1.5 capitalize transition-colors ${
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
          <span className="w-full text-xs font-medium tabular-nums text-muted-foreground sm:ml-2 sm:w-auto sm:text-sm">
            {range.from} → {range.to}
          </span>
        </div>

        {ops.isLoading ? (
          <LoadingState label="Loading calendar…" />
        ) : ops.error ? (
          <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <p className="font-medium">Calendar data could not be loaded.</p>
            <p className="mt-1">{(ops.error as Error).message}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void ops.refetch()}>
              Retry calendar
            </Button>
          </div>
        ) : (
          <>
          <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-border bg-card shadow-sm" style={{ WebkitOverflowScrolling: "touch" }}>
            <div className="min-w-max">
              <p className="border-b bg-muted/20 px-3 py-2 text-[11px] font-medium text-muted-foreground sm:hidden">Swipe horizontally to view more dates <span aria-hidden="true">→</span></p>
              <div
                className="grid border-b bg-muted/40 text-xs font-medium"
                style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(76px, 1fr))` }}
              >
                <div className="sticky left-0 z-40 w-[180px] min-w-[180px] border-r bg-muted/95 px-3 py-2 shadow-[4px_0_8px_-7px_rgba(15,23,42,0.45)]">Room</div>
                {days.map((day) => (
                  <div key={day} className={`border-r px-2 py-2 text-center ${day === today ? "bg-primary/10 text-primary" : ""}`}>
                    <div>{new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div className="font-semibold">{day.slice(8, 10)}</div>
                  </div>
                ))}
              </div>
              {visibleRooms.map((room: any) => {
                const roomBookings = visibleBookings.filter((booking) => booking.room_id === room.id);
                const bookingLanes = buildBookingLanes(roomBookings, range.from, days.length);
                const roomHolds = activeHolds.filter((hold) => hold.room_id === room.id);
                const lanes = [
                  ...bookingLanes.map((items) => ({ kind: "bookings" as const, items })),
                  ...roomHolds.map((hold) => ({
                    kind: "hold" as const,
                    items: [{
                      booking: { ...hold, guest_name: hold.guest_email || "Temporary hold", reference: "HOLD", status: "hold" },
                      start: Math.max(0, Math.floor((Date.parse(`${hold.check_in}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000)),
                      end: Math.min(days.length, Math.ceil((Date.parse(`${hold.check_out}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000)),
                    }],
                  })),
                ].filter((lane) => lane.items.some((item) => item.end > item.start));
                if (!lanes.length) lanes.push({ kind: "bookings" as const, items: [] });
                return (
                  <div
                    key={room.id}
                    className="grid border-b last:border-b-0"
                    style={{ gridTemplateColumns: `180px minmax(${days.length * 76}px, 1fr)` }}
                    onDragOver={(event) => { if (dragBookingId) event.preventDefault(); }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!dragBookingId) return;
                      const source = (d.bookings as any[]).find((booking) => booking.id === dragBookingId);
                      if (!source || source.room_id === room.id) return;
                      const fromRoom = (d.rooms as any[]).find((candidate) => candidate.id === source.room_id);
                      setReassignCtx({
                        bookingId: source.id,
                        fromRoomName: fromRoom?.name ?? "current room",
                        toRoomId: room.id,
                        toRoomName: room.name,
                      });
                      setDragBookingId(null);
                    }}
                  >
                    <div className="sticky left-0 z-30 flex w-[180px] min-w-[180px] items-start border-r bg-card px-3 py-3 text-xs font-semibold shadow-[4px_0_8px_-7px_rgba(15,23,42,0.45)]">
                      <button
                        className="text-left hover:text-primary hover:underline"
                        onClick={() => {
                          setBlockCtx({ roomId: room.id, roomName: room.name, from: range.from, to: range.to });
                          setBlockOpen(true);
                        }}
                        title="Click to block or unblock this room for the displayed range"
                      >
                        {room.name}
                        <span className="mt-1 block font-normal text-muted-foreground">{room.total_units} unit(s)</span>
                      </button>
                    </div>
                    <div className="min-w-0">
                      {lanes.map((lane, laneIndex) => (
                        <div
                          key={`${room.id}-lane-${laneIndex}`}
                          className="grid min-h-[42px] border-b last:border-b-0"
                          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(76px, 1fr))` }}
                        >
                          {days.map((day, dayIndex) => {
                            const inventory = (d.inventory as any[]).find((item) => item.room_id === room.id && item.date === day);
                            return (
                              <div
                                key={day}
                                className={`border-r ${inventory?.is_blocked ? "bg-rose-500/15" : day === today ? "bg-primary/[0.035]" : ""}`}
                                style={{ gridColumn: dayIndex + 1, gridRow: 1 }}
                                title={inventory?.is_blocked ? "Room blocked" : `${inventory?.available_units ?? room.total_units} unit(s) available`}
                              />
                            );
                          })}
                          {lane.items.map(({ booking, start, end }) => {
                            const isHold = booking.status === "hold";
                            const statusClass = isHold
                              ? "border-amber-600/40 bg-amber-500/20 text-amber-950 dark:text-amber-100"
                              : booking.status === "checked_in"
                                ? "border-emerald-700/30 bg-emerald-600/20 text-emerald-950 dark:text-emerald-100"
                                : booking.status === "pending"
                                  ? "border-orange-600/30 bg-orange-500/20 text-orange-950 dark:text-orange-100"
                                  : booking.status === "completed"
                                    ? "border-slate-500/30 bg-slate-500/15 text-foreground"
                                    : "border-blue-600/30 bg-blue-500/20 text-blue-950 dark:text-blue-100";
                            const label = `${booking.guest_name} · ${booking.reference}`;
                            return isHold ? (
                              <div
                                key={booking.id}
                                className={`z-10 m-1 flex min-w-0 items-center overflow-hidden rounded-md border px-2 text-[11px] font-medium ${statusClass}`}
                                style={{ gridColumn: `${start + 1} / ${end + 1}`, gridRow: 1 }}
                                title={`${label} · ${booking.check_in} to ${booking.check_out}`}
                              >
                                <Timer className="mr-1 h-3 w-3 shrink-0" />
                                <span className="truncate">{label}</span>
                              </div>
                            ) : (
                              <Link
                                key={booking.id}
                                to="/admin/operations/reservations/$id"
                                params={{ id: booking.id }}
                                draggable
                                onDragStart={(event) => {
                                  setDragBookingId(booking.id);
                                  event.dataTransfer.setData("text/plain", booking.id);
                                  event.dataTransfer.effectAllowed = "move";
                                }}
                                onDragEnd={() => setDragBookingId(null)}
                                className={`z-10 m-1 flex min-w-0 cursor-grab items-center overflow-hidden rounded-md border px-2 text-[11px] font-medium shadow-sm hover:brightness-95 active:cursor-grabbing ${statusClass}`}
                                style={{ gridColumn: `${start + 1} / ${end + 1}`, gridRow: 1 }}
                                title={`${label} · ${booking.status} · ${booking.check_in} → ${booking.check_out}. Drag to another room to reassign.`}
                              >
                                <span className="truncate">{booking.guest_name}</span>
                                <span className="ml-1 shrink-0 opacity-70">{booking.reference}</span>
                              </Link>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-blue-600/30 bg-blue-500/20" /> Confirmed</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-emerald-700/30 bg-emerald-600/20" /> Checked in</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-orange-600/30 bg-orange-500/20" /> Pending</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-amber-600/40 bg-amber-500/20" /> Active hold</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-sm border border-rose-600/30 bg-rose-500/20" /> Blocked date</span>
          </div>
          </>
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
        {/* Block dialog kept below; reassign + suggest dialogs are appended before the outer wrapper close. */}
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
                <DatePickerField
                  value={blockCtx?.from ?? ""}
                  onChange={(value) => setBlockCtx((c) => c && { ...c, from: value })}
                  placeholder="Start date"
                />
              </div>
              <div>
                <Label>To (exclusive)</Label>
                <DatePickerField
                  value={blockCtx?.to ?? ""}
                  minDate={blockCtx?.from}
                  onChange={(value) => setBlockCtx((c) => c && { ...c, to: value })}
                  placeholder="End date"
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

      {/* Reassign confirmation */}
      <Dialog open={!!reassignCtx} onOpenChange={(o) => !o && setReassignCtx(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reassign reservation</DialogTitle>
            <DialogDescription>
              Move this booking from <strong>{reassignCtx?.fromRoomName}</strong> to{" "}
              <strong>{reassignCtx?.toRoomName}</strong>. Availability is re-checked before the swap; the audit log is
              updated automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Reason (optional)</Label>
            <Textarea
              rows={2}
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="e.g. Upgrade for anniversary stay"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReassignCtx(null)}>Cancel</Button>
            <Button
              disabled={doReassign.isPending}
              onClick={() =>
                reassignCtx &&
                doReassign.mutate({
                  bookingId: reassignCtx.bookingId,
                  newRoomId: reassignCtx.toRoomId,
                  reason: reassignReason || undefined,
                })
              }
            >
              Confirm reassignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI room suggestion */}
      <Dialog open={!!suggestForBooking} onOpenChange={(o) => !o && setSuggestForBooking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suggested rooms</DialogTitle>
            <DialogDescription>
              Ranked by availability, capacity fit, and guest preferences. Staff approves — nothing changes until you
              confirm.
            </DialogDescription>
          </DialogHeader>
          {suggestions.isLoading ? (
            <LoadingState label="Analysing preferences…" />
          ) : (suggestions.data?.suggestions ?? []).length === 0 ? (
            <EmptyState title="No better match" description="No other available rooms fit this booking right now." />
          ) : (
            <div className="space-y-2">
              {suggestions.data!.suggestions.map((s) => (
                <div key={s.room_id} className="flex items-start justify-between rounded-md border p-3">
                  <div className="min-w-0">
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Sleeps {s.max_occupancy} · {s.min_available} available · from {s.base_price.toLocaleString()}
                    </div>
                    {s.reasons.length > 0 && (
                      <div className="mt-1 text-xs">{s.reasons.join(" · ")}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      const from = (d.rooms as any[]).find((r) => r.id === suggestions.data!.currentRoomId);
                      setReassignCtx({
                        bookingId: suggestForBooking!,
                        fromRoomName: from?.name ?? "current room",
                        toRoomId: s.room_id,
                        toRoomName: s.name,
                      });
                    }}
                  >
                    Move here
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}