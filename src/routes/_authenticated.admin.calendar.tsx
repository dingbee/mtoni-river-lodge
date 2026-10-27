// Unified availability calendar — extends the ops calendar with block controls,
// active hold visibility, and a live event feed. Reads through the same
// hold-aware get_room_availability path used by the public site.

import { useMemo, useState } from "react";
import { usePropertyContext } from "@/modules/property/PropertyContext";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, Ban, BedDouble, CalendarDays, Plus, RefreshCw, ShieldOff, Sparkles, Timer, Wrench } from "lucide-react";
import { findCalendarConflicts, type StayNasCalendarEvent } from "@/lib/calendar-event-contract";
import { toast } from "sonner";

import { createCalendarStaffSchedule, getOpsCalendar, listCalendarStaff } from "@/lib/operations.functions";
import {
  listActiveHolds,
  listCalendarEvents,
  reassignBookingRoom,
  releaseHoldStaff,
  setRoomBlock,
  suggestRoomAssignment,
} from "@/lib/availability.functions";
import { updateRoomState } from "@/lib/operations.functions";
import { RoomStateChip, type RoomStateValue, ROOM_STATES } from "@/components/os/operations/RoomStateChip";

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
import { NewReservationDialog } from "@/components/os/reservations/NewReservationDialog";

export const Route = createFileRoute("/_authenticated/admin/calendar")({
  head: () => ({
    meta: [
      { title: "StayNas Enterprise Calendar" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: UnifiedCalendarPage,
});

type View = "day" | "week" | "month" | "agenda";
type Cell = { date: string; booking?: { id: string; guest_name: string; reference: string }; blocked?: boolean; units?: number; hold?: boolean };

function formatEaDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T12:00:00`) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function dateInTimezone(value: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function propertyLocalDateTimeToIso(value: string, timezone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("Enter a valid property-local date and time");
  const desired = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]) };
  const target = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
    const part = (type: string) => Number(parts.find((item) => item.type === type)?.value ?? 0);
    const represented = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"));
    const delta = target - represented;
    if (delta === 0) break;
    candidate += delta;
  }
  const verify = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(candidate));
  const part = (type: string) => Number(verify.find((item) => item.type === type)?.value ?? 0);
  if (part("year") !== desired.year || part("month") !== desired.month || part("day") !== desired.day || part("hour") !== desired.hour || part("minute") !== desired.minute) {
    throw new Error("That local time does not exist in the selected property timezone");
  }
  return new Date(candidate).toISOString();
}
function eventOccursOnDay(start: string, end: string, timezone: string, day: string) {
  const startDay = dateInTimezone(start, timezone);
  const endDay = dateInTimezone(end, timezone);
  if (startDay > day || endDay < day) return false;
  if (endDay === day) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(end));
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    if (hour === "00" && minute === "00") return false;
  }
  return true;
}
function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function iso(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function shift(d: Date, view: View, dir: number) {
  const n = new Date(d);
  if (view === "day") n.setDate(n.getDate() + dir);
  else if (view === "week" || view === "agenda") n.setDate(n.getDate() + dir * 7);
  else { n.setDate(1); n.setMonth(n.getMonth() + dir); }
  return n;
}
function rangeFor(view: View, anchor: Date) {
  const start = new Date(anchor);
  const end = new Date(anchor);
  if (view === "day") {
    end.setDate(start.getDate() + 1);
  } else if (view === "week" || view === "agenda") {
    const dow = start.getDay();
    start.setDate(start.getDate() - dow);
    end.setTime(start.getTime());
    end.setDate(end.getDate() + 7);
  } else {
    start.setDate(1);
    end.setTime(start.getTime());
    end.setMonth(end.getMonth() + 1);
  }
  return { from: iso(start), to: iso(end) };
}
function daysBetween(from: string, to: string) {
  const out: string[] = [];
  const s = new Date(`${from}T12:00:00`);
  const e = new Date(`${to}T12:00:00`);
  for (let d = new Date(s); d < e; d.setDate(d.getDate() + 1)) out.push(iso(d));
  return out;
}

function UnifiedCalendarPage() {
  const { property } = usePropertyContext();
  const qc = useQueryClient();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date(`${todayInTimezone(property.timezone)}T12:00:00`));
  const [createReservationOpen, setCreateReservationOpen] = useState(false);
  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);
  const days = useMemo(() => daysBetween(range.from, range.to), [range]);

  const fetchOps = useServerFn(getOpsCalendar);
  const fetchHolds = useServerFn(listActiveHolds);
  const fetchEvents = useServerFn(listCalendarEvents);
  const blockFn = useServerFn(setRoomBlock);
  const releaseFn = useServerFn(releaseHoldStaff);
  const reassignFn = useServerFn(reassignBookingRoom);
  const suggestFn = useServerFn(suggestRoomAssignment);
  const fetchCalendarStaff = useServerFn(listCalendarStaff);
  const createScheduleFn = useServerFn(createCalendarStaffSchedule);
  const updateRoomStateFn = useServerFn(updateRoomState);

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
    queryKey: ["calendar", "ops", property.id, range.from, range.to],
    queryFn: () => fetchOps({ data: { propertyId: property.id, from: range.from, to: range.to } }),
    staleTime: 30_000,
  });
  const holds = useQuery({
    queryKey: ["calendar", "holds", property.id, range.from, range.to],
    queryFn: () => fetchHolds({ data: { propertyId: property.id, from: range.from, to: range.to } }),
    refetchInterval: 30_000,
  });
  const events = useQuery({
    queryKey: ["calendar", "events", property.id, range.from, range.to],
    queryFn: () => fetchEvents({ data: { propertyId: property.id, from: range.from, to: range.to, limit: 50 } }),
    refetchInterval: 60_000,
  });

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleTitle, setScheduleTitle] = useState("Staff shift");
  const [scheduleStaffId, setScheduleStaffId] = useState("");
  const [scheduleStart, setScheduleStart] = useState("");
  const [scheduleEnd, setScheduleEnd] = useState("");
  const [scheduleNotes, setScheduleNotes] = useState("");
  const calendarStaff = useQuery({
    queryKey: ["calendar", "staff", property.id],
    queryFn: () => fetchCalendarStaff({ data: { propertyId: property.id } }),
    enabled: scheduleOpen,
    staleTime: 60_000,
  });

  const [selectedAgendaBooking, setSelectedAgendaBooking] = useState<any | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockCtx, setBlockCtx] = useState<{ roomId: string; roomName: string; from: string; to: string }>();
  const [blockReason, setBlockReason] = useState("");
  const [blockNotes, setBlockNotes] = useState("");

  const updateRoomStatus = useMutation({
    mutationFn: (v: { id: string; state: RoomStateValue }) =>
      updateRoomStateFn({ data: v }),
    onSuccess: () => {
      toast.success("Room status updated");
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["ops-room-board"] });
      qc.invalidateQueries({ queryKey: ["ops-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doBlock = useMutation({
    mutationFn: (v: { roomId: string; from: string; to: string; blocked: boolean; reason?: string }) =>
      blockFn({ data: v }),
    onSuccess: () => {
      toast.success("Calendar updated");
      qc.invalidateQueries({ queryKey: ["calendar"] });
      setBlockOpen(false);
      setBlockReason("");
      setBlockNotes("");
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

  const createSchedule = useMutation({
    mutationFn: () => createScheduleFn({
      data: {
        propertyId: property.id,
        staffUserId: scheduleStaffId,
        title: scheduleTitle.trim(),
        startsAt: propertyLocalDateTimeToIso(scheduleStart, property.timezone),
        endsAt: propertyLocalDateTimeToIso(scheduleEnd, property.timezone),
        notes: scheduleNotes.trim() || undefined,
      },
    }),
    onSuccess: () => {
      toast.success("Staff schedule created");
      setScheduleOpen(false);
      setScheduleTitle("Staff shift");
      setScheduleStaffId("");
      setScheduleNotes("");
      qc.invalidateQueries({ queryKey: ["calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const d: any = ops.data ?? { rooms: [], bookings: [], inventory: [], operationalEvents: [], roomStates: [] };

  const bookingEvents = useMemo(() =>
    (d.bookings as any[])
      .filter((booking) => booking.room_id && ["confirmed", "checked_in"].includes(String(booking.status)))
      .map((booking): StayNasCalendarEvent => ({
        id: booking.id,
        propertyId: property.id,
        kind: "reservation",
        title: booking.guest_name || booking.reference || "Reservation",
        start: booking.check_in,
        end: booking.check_out,
        allDay: true,
        timezone: property.timezone,
        status: booking.status === "checked_in" ? "in_progress" : "confirmed",
        source: { domain: "reservations", entityType: "booking", entityId: booking.id },
        resource: { kind: "room", id: booking.room_id, label: booking.room_id },
        editable: false,
      })),
    [d.bookings, property.id, property.timezone],
  );
  const operationalCalendarEvents = useMemo(() =>
    ((d.operationalEvents ?? []) as any[]).map((event): StayNasCalendarEvent => {
      const room = (d.rooms as any[]).find((item) => item.id === event.room_id);
      const kind = String(event.event_kind ?? "custom");
      const sourceDomain = kind === "maintenance" ? "maintenance" : kind === "housekeeping" ? "housekeeping" : kind === "staff" ? "staff" : "calendar";
      const rawStatus = String(event.status ?? "confirmed");
      const status: StayNasCalendarEvent["status"] = rawStatus === "completed" ? "completed" : rawStatus === "in_progress" ? "in_progress" : rawStatus === "cancelled" ? "cancelled" : rawStatus === "conflict" ? "conflict" : "confirmed";
      return {
        id: String(event.id),
        propertyId: property.id,
        kind: kind as StayNasCalendarEvent["kind"],
        title: String(event.title ?? "Operational event"),
        start: String(event.starts_at),
        end: String(event.ends_at),
        allDay: Boolean(event.all_day),
        timezone: property.timezone,
        status,
        source: { domain: sourceDomain, entityType: String(event.source_type ?? kind), entityId: String(event.source_id ?? event.id) },
        ...(event.room_id ? { resource: { kind: "room" as const, id: String(event.room_id), label: room?.name ?? "Room" } } : event.assignee_id ? { resource: { kind: "staff" as const, id: String(event.assignee_id), label: String(event.assignee_id) } } : {}),
        description: event.description ?? undefined,
        editable: false,
      };
    }),
    [d.operationalEvents, d.rooms, property.id, property.timezone],
  );
  const allCalendarEvents = useMemo(() => [...bookingEvents, ...operationalCalendarEvents], [bookingEvents, operationalCalendarEvents]);
  const bookingConflicts = useMemo(() => findCalendarConflicts(allCalendarEvents), [allCalendarEvents]);

  const activeHolds = holds.data ?? [];
  const activeHoldsByRoomDate = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const h of activeHolds) {
      const s = new Date(`${h.check_in}T12:00:00`);
      const e = new Date(`${h.check_out}T12:00:00`);
      for (let dd = new Date(s); dd < e; dd.setDate(dd.getDate() + 1)) {
        const key = `${h.room_id}:${iso(dd)}`;
        (map[key] ??= new Set<string>()).add(h.id);
      }
    }
    return map;
  }, [activeHolds]);

  const bookingsToday = useMemo(() => {
    const today = todayInTimezone(property.timezone);
    return (d.bookings as any[]).filter((b) => b.check_in <= today && b.check_out > today).length;
  }, [d.bookings, property.timezone]);

  // Derived views after filter application.
  const today = todayInTimezone(property.timezone);
  const visibleBookings = useMemo(() => {
    return (d.bookings as any[]).filter((b) => {
      if (filters.arrivalsToday && b.check_in !== today) return false;
      if (filters.departuresToday && b.check_out !== today) return false;
      if (filters.holds && !activeHolds.some((h) => h.room_id === b.room_id && h.check_in < b.check_out && h.check_out > b.check_in)) return false;
      if (filters.vip) {
        const gt = (b.guest_type || "").toString();
        if (gt !== "vip" && gt !== "climber") return false;
      }
      return true;
    });
  }, [d.bookings, filters, today, activeHolds]);

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
        title="Calendar"
        description="Manage reservations, room readiness and property operations in one workspace."
        actions={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
            <Button className="col-span-2 w-full sm:col-span-1 sm:w-auto" size="sm" onClick={() => setCreateReservationOpen(true)}><Plus className="mr-2 h-4 w-4" /> New reservation</Button>
            <Button
              className="w-full sm:w-auto"
              size="sm"
              variant="outline"
              onClick={() => {
                const today = todayInTimezone(property.timezone);
                setScheduleStart(today + "T09:00");
                setScheduleEnd(today + "T17:00");
                setScheduleOpen(true);
              }}
            >
              <CalendarDays className="mr-2 h-4 w-4" /> Schedule staff
            </Button>
            <Button className="w-full sm:w-auto" variant="outline" size="sm" asChild>
              <Link to="/admin/operations/calendar">Ops calendar</Link>
            </Button>
            <Button
              className="w-full sm:w-auto"
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

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-muted/30 p-1" aria-label="Reservations workspace navigation">
        <Link to="/admin/bookings" className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground">Reservations list</Link>
        <Link to="/admin/calendar" className="inline-flex items-center gap-2 rounded-lg bg-card px-4 py-2 text-sm font-semibold text-[color:var(--os-success)] shadow-sm" aria-current="page"><CalendarDays className="h-4 w-4" /> Room calendar</Link>
      </div>

      <NewReservationDialog
        open={createReservationOpen}
        onOpenChange={setCreateReservationOpen}
        initialCheckIn={iso(anchor)}
        initialCheckOut={iso(shift(anchor, "day", 1))}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["calendar"] });
          qc.invalidateQueries({ queryKey: ["admin-bookings"] });
        }}
      />

      <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatCard label="In-house today" value={String(bookingsToday)} icon={CalendarDays} className="p-3 sm:p-5" />
        <StatCard label="Arrivals today" value={String(arrivalsCount)} icon={CalendarDays} className="p-3 sm:p-5" />
        <StatCard label="Departures today" value={String(departuresCount)} icon={CalendarDays} className="p-3 sm:p-5" />
        <StatCard label="Resource conflicts" value={String(bookingConflicts.length)} icon={AlertTriangle} className="p-3 sm:p-5" />
        <StatCard
          label="Blocked days"
          value={String((d.inventory as any[]).filter((i) => i.is_blocked).length)}
          icon={Ban}
          className="col-span-2 flex-row items-center justify-between p-3 sm:col-span-1 sm:flex-col sm:items-stretch sm:p-5 [&>p:nth-of-type(1)]:mt-0 [&>p:nth-of-type(1)]:text-3xl sm:[&>p:nth-of-type(1)]:mt-5 sm:[&>p:nth-of-type(1)]:text-[2.4rem]"
        />
      </div>

      <SectionCard title="Room status" description="Change readiness and service status using the governed room-state workflow. Status changes are scoped to the selected property.">
        {ops.isLoading ? <LoadingState label="Loading room status…" /> : (d.roomStates as any[]).length === 0 ? (
          <div className="rounded-xl border border-dashed p-5 sm:p-7">
            <div className="mx-auto max-w-xl text-center">
              <BedDouble className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h3 className="font-semibold">No room units configured for this property</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Room-status controls appear after this property has room types and physical units. The selected Nolmark CDMA owner context currently has no room inventory; StayNas will not attach Mtoni rooms or bookings to it.
              </p>
              <Button asChild className="mt-4">
                <Link to="/admin/operations/rooms/configure">Configure room inventory</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(d.roomStates as any[]).map((unit) => (
              <div key={unit.id} className="min-w-0 rounded-lg border bg-card p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{unit.unit_label}</div>
                    <div className="truncate text-xs text-muted-foreground">{unit.room?.name ?? "Room"}</div>
                  </div>
                  <RoomStateChip state={unit.state as RoomStateValue} />
                </div>
                <Select
                  value={unit.state}
                  onValueChange={(state) => updateRoomStatus.mutate({ id: unit.id, state: state as RoomStateValue })}
                  disabled={updateRoomStatus.isPending}
                >
                  <SelectTrigger aria-label={`Change status for ${unit.unit_label}`} className="h-9 text-xs">
                    <SelectValue placeholder="Change room status" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROOM_STATES.map((state) => (
                      <SelectItem key={state} value={state} className="text-xs">
                        {state.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {unit.state_note && <p className="mt-2 text-xs text-muted-foreground">{unit.state_note}</p>}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Filters" description="Narrow the calendar and stat cards.">
        <div className="flex flex-wrap items-center gap-3">
          {[
            { k: "arrivalsToday" as const, label: "Arrivals today" },
            { k: "departuresToday" as const, label: "Departures today" },
            { k: "vip" as const, label: "VIP / climbers" },
            { k: "blocked" as const, label: "Blocked rooms" },
            { k: "holds" as const, label: "Bookings with holds" },
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_270px]">
      <SectionCard
        title="Rooms & Reservations"
        description="Reservations, blocked dates, active holds and operational markers. Select a room to manage its availability."
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border p-0.5 text-xs">
            {(["day", "week", "month", "agenda"] as View[]).map((v) => (
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
          <div className="flex items-center gap-2">
            <Label htmlFor="calendar-date" className="sr-only">Jump to date</Label>
            <Input id="calendar-date" aria-label="Jump to date" type="date" className="w-[145px] sm:w-[165px]" value={iso(anchor)} onChange={(e) => { if (e.target.value) setAnchor(new Date(`${e.target.value}T12:00:00`)); }} />
          </div>
          <span className="w-full text-sm text-muted-foreground sm:w-auto">{formatEaDate(range.from)} – {formatEaDate(range.to)}</span>
        </div>

        {ops.isLoading ? (
          <LoadingState label="Loading calendar…" />
        ) : (
          <>
          <p className="mb-2 rounded-md bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground md:hidden">Swipe the timeline horizontally to compare dates. Use the room name to manage blocks; open a booking to view details or choose a new room.</p>
          {view === "agenda" ? (
            <div className="space-y-3 p-1">
              {days.map((day) => {
                const bookingItems = (visibleBookings as any[]).flatMap((booking) => {
                  const entries: Array<{ key: string; label: string; booking: any; sortAt: string }> = [];
                  if (booking.check_in === day) entries.push({ key: booking.id + ":arrival:" + day, label: "Arrival", booking, sortAt: day + "T00:00:00" });
                  if (booking.check_out === day) entries.push({ key: booking.id + ":departure:" + day, label: "Departure", booking, sortAt: day + "T23:59:00" });
                  if (booking.check_in < day && booking.check_out > day) entries.push({ key: booking.id + ":in-house:" + day, label: "In house", booking, sortAt: day + "T12:00:00" });
                  return entries;
                });
                const operationalItems = (d.operationalEvents ?? [])
                  .filter((event: any) => eventOccursOnDay(event.starts_at, event.ends_at, property.timezone, day))
                  .map((event: any) => ({
                    key: "ops:" + event.source_type + ":" + event.id + ":" + day,
                    label: String(event.event_kind ?? "Operational").replaceAll("_", " "),
                    operational: event,
                    sortAt: String(event.starts_at ?? ""),
                  }));
                const items = [...bookingItems, ...operationalItems].sort((a, b) => a.sortAt.localeCompare(b.sortAt));
                return (
                  <section key={day} className="overflow-hidden rounded-lg border">
                    <div className="flex items-center justify-between bg-muted/40 px-3 py-2 text-sm font-medium">
                      <span>{formatEaDate(day)}</span><Badge variant="outline">{items.length} {items.length === 1 ? "event" : "events"}</Badge>
                    </div>
                    {items.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-muted-foreground">No events for this date.</p>
                    ) : (
                      <div className="divide-y">
                        {items.map((item: any) => {
                          if (item.booking) {
                            const room = (d.rooms as any[]).find((r) => r.id === item.booking.room_id);
                            return (
                              <button key={item.key} type="button" onClick={() => setSelectedAgendaBooking(item.booking)} className="flex w-full flex-col gap-1 px-3 py-3 text-left transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                                <span className="flex min-w-0 items-center gap-2"><Badge variant={item.label === "Departure" ? "secondary" : item.label === "Arrival" ? "default" : "outline"}>{item.label}</Badge><span className="truncate font-medium">{item.booking.guest_name || "Guest"}</span><span className="text-xs text-muted-foreground">{item.booking.reference}</span></span>
                                <span className="text-xs text-muted-foreground">{room?.name ?? "Unassigned room"} · {formatEaDate(item.booking.check_in)} – {formatEaDate(item.booking.check_out)}</span>
                              </button>
                            );
                          }
                          const event = item.operational;
                          const room = (d.rooms as any[]).find((r) => r.id === event.room_id);
                          const label = String(event.event_kind ?? "task");
                          return (
                            <div key={item.key} className="flex flex-col gap-1 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <span className="flex min-w-0 items-center gap-2">
                                <Badge variant={label === "maintenance" ? "destructive" : label === "staff" ? "secondary" : "outline"}>{item.label}</Badge>
                                <span className="truncate font-medium">{event.title}</span>
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {room?.name ?? (event.assignee_id ? "Staff " + String(event.assignee_id).slice(0, 8) : "Property operations")}
                                {event.status ? " · " + String(event.status).replaceAll("_", " ") : ""}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
          <div className="max-w-full overflow-x-auto rounded-lg border">
            <table className="w-max min-w-full table-fixed text-xs">
              <thead>
                <tr className="bg-muted/40">
                  <th className="sticky left-0 z-20 w-28 min-w-28 border-r bg-muted/40 px-2 py-2 text-left sm:w-36 sm:min-w-36">Room</th>
                  {days.map((day) => (
                    <th key={day} className="w-[68px] min-w-[68px] border-r px-1 py-2 text-center whitespace-nowrap sm:w-[78px] sm:min-w-[78px]">
                      {formatEaDate(day).slice(0, 5)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRooms.map((r: any) => (
                  <tr
                    key={r.id}
                    onDragOver={(e) => { if (dragBookingId) e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (!dragBookingId) return;
                      const src = (d.bookings as any[]).find((x) => x.id === dragBookingId);
                      if (!src || src.room_id === r.id) return;
                      const fromRoom = (d.rooms as any[]).find((x) => x.id === src.room_id);
                      setReassignCtx({
                        bookingId: src.id,
                        fromRoomName: fromRoom?.name ?? "current room",
                        toRoomId: r.id,
                        toRoomName: r.name,
                      });
                      setDragBookingId(null);
                    }}
                  >
                    <td className="sticky left-0 z-10 w-28 min-w-28 border-r bg-card px-2 py-2 font-medium sm:w-36 sm:min-w-36">
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
                      const b = visibleBookings.find(
                        (bk) => bk.room_id === r.id && bk.check_in <= day && bk.check_out > day,
                      );
                      const inv = (d.inventory as any[]).find((i) => i.room_id === r.id && i.date === day);
                      const operationalForCell = operationalCalendarEvents.filter((event) =>
                        event.resource?.kind === "room" && event.resource.id === r.id && eventOccursOnDay(event.start, event.end, property.timezone, day),
                      );
                      const blocked = inv?.is_blocked;
                      if (filters.blocked && !blocked) return <td key={day} className="border-r px-1 py-1 text-center text-muted-foreground">—</td>;
                      const held = activeHoldsByRoomDate[`${r.id}:${day}`]?.size ?? 0;
                      if (filters.holds && !held) {
                        return <td key={day} className="border-r px-1 py-1 text-center opacity-30">·</td>;
                      }
                      return (
                        <td
                          key={day}
                          className={`w-[68px] min-w-[68px] border-r px-1 py-1 text-center sm:w-[78px] sm:min-w-[78px] ${
                            blocked || operationalForCell.some((event) => event.kind === "maintenance") ? "bg-rose-500/15" : b ? "bg-blue-500/15" : operationalForCell.length ? "bg-emerald-500/10" : held ? "bg-amber-500/15" : ""
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
                            <div
                              draggable
                              onDragStart={(e) => {
                                setDragBookingId(b.id);
                                e.dataTransfer.setData("text/plain", b.id);
                                e.dataTransfer.effectAllowed = "move";
                              }}
                              onDragEnd={() => setDragBookingId(null)}
                              className="group flex items-center justify-center gap-1 cursor-grab active:cursor-grabbing"
                              title={`Drag to reassign · ${b.guest_name} · ${b.reference}`}
                            >
                              <Link
                                to="/admin/operations/reservations/$id"
                                params={{ id: b.id }}
                                className="truncate text-[10px] hover:underline"
                                onClick={(e) => { if (dragBookingId) e.preventDefault(); }}
                              >
                                {b.guest_name.split(" ")[0]}
                              </Link>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setSuggestForBooking(b.id); }}
                                className="ml-1 inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-primary/20 bg-background text-primary hover:bg-primary/10"
                                title="Find an available room"
                                aria-label={`Find an available room for ${b.guest_name}`}
                              >
                                <Sparkles className="h-3 w-3" />
                              </button>
                            </div>
                          ) : blocked ? (
                            "×"
                          ) : held ? (
                            `⏱${held}`
                          ) : (
                            inv?.available_units ?? r.total_units
                          )}
                          {operationalForCell.length > 0 && (
                            <div className="mt-1 flex flex-col items-center gap-0.5">
                              {operationalForCell.slice(0, 2).map((event) => (
                                <span key={event.id} title={event.title} className={event.kind === "maintenance" ? "max-w-full truncate rounded bg-rose-500/20 px-1 text-[9px] leading-4 text-rose-700 dark:text-rose-300" : event.kind === "staff" ? "max-w-full truncate rounded bg-violet-500/15 px-1 text-[9px] leading-4 text-violet-700 dark:text-violet-300" : "max-w-full truncate rounded bg-emerald-500/15 px-1 text-[9px] leading-4 text-emerald-700 dark:text-emerald-300"}>
                                  {event.kind === "maintenance" ? "MNT" : event.kind === "housekeeping" ? "HK" : "STAFF"}
                                </span>
                              ))}
                            </div>
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
          </>
        )}
      </SectionCard>

      <aside className="space-y-4">
        <SectionCard title={anchor.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}>
          <div className="mb-3 flex items-center justify-between">
            <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, Math.min(anchor.getDate(), 28)))}>‹</Button>
            <Button size="sm" variant="outline" onClick={() => setAnchor(new Date())}>Today</Button>
            <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, Math.min(anchor.getDate(), 28)))}>›</Button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-muted-foreground">
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map((day) => <span key={day} className="py-1">{day}</span>)}
            {Array.from({ length: new Date(anchor.getFullYear(), anchor.getMonth(), 1).getDay() }, (_, i) => <span key={`blank-${i}`} />)}
            {Array.from({ length: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate() }, (_, i) => {
              const date = new Date(anchor.getFullYear(), anchor.getMonth(), i + 1, 12);
              const dateKey = iso(date);
              const selected = dateKey === iso(anchor);
              const isToday = dateKey === todayInTimezone(property.timezone);
              return <button key={dateKey} type="button" onClick={() => setAnchor(date)} className={`aspect-square rounded-md text-xs hover:bg-muted ${selected ? "bg-primary text-primary-foreground" : isToday ? "border border-primary text-primary" : ""}`}>{i + 1}</button>;
            })}
          </div>
        </SectionCard>

        <SectionCard title="Calendars" description="Operational layers in this property.">
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />Reservations</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Housekeeping</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />Maintenance</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-violet-500" />Staff schedules</div>
            <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500" />Blocked rooms</div>
          </div>
        </SectionCard>

        <SectionCard title="Today's agenda" description={formatEaDate(today)}>
          <div className="space-y-3">
            {(d.bookings as any[]).filter((booking) => booking.check_in === today || booking.check_out === today || (booking.check_in < today && booking.check_out > today)).slice(0, 8).map((booking) => (
              <div key={booking.id} className="flex gap-2 text-xs">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${booking.check_in === today ? "bg-blue-500" : booking.check_out === today ? "bg-amber-500" : "bg-emerald-500"}`} />
                <div className="min-w-0">
                  <div className="font-medium">{booking.check_in === today ? "Arrival" : booking.check_out === today ? "Departure" : "In house"} · {booking.guest_name}</div>
                  <div className="text-muted-foreground">{booking.reference} · {(d.rooms as any[]).find((room) => room.id === booking.room_id)?.name ?? "Room"}</div>
                </div>
              </div>
            ))}
            {(d.bookings as any[]).filter((booking) => booking.check_in === today || booking.check_out === today || (booking.check_in < today && booking.check_out > today)).length === 0 && <p className="text-xs text-muted-foreground">No reservation activity for today.</p>}
          </div>
        </SectionCard>
      </aside>
      </div>

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
                      {e.date_from ? formatEaDate(e.date_from) : ""}
                      {e.date_to ? ` – ${formatEaDate(e.date_to)}` : ""}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Schedule staff</DialogTitle>
            <DialogDescription>
              Create a property-scoped shift or assignment. All entered times use {property.timezone}.
            </DialogDescription>
          </DialogHeader>
          {calendarStaff.isLoading ? (
            <LoadingState label="Loading property staff…" />
          ) : calendarStaff.isError ? (
            <p className="text-sm text-destructive">Could not load staff for this property. Refresh and try again.</p>
          ) : !calendarStaff.data?.canManage ? (
            <p className="text-sm text-muted-foreground">Only property owners, managers and administrators can create staff schedules.</p>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Schedule title</Label>
                <Input value={scheduleTitle} onChange={(e) => setScheduleTitle(e.target.value)} maxLength={160} placeholder="Front desk morning shift" />
              </div>
              <div className="space-y-1">
                <Label>Staff member</Label>
                <Select value={scheduleStaffId} onValueChange={setScheduleStaffId}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {(calendarStaff.data.staff ?? []).map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>{member.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Starts</Label>
                  <Input type="datetime-local" value={scheduleStart} onChange={(e) => setScheduleStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Ends</Label>
                  <Input type="datetime-local" value={scheduleEnd} onChange={(e) => setScheduleEnd(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes (optional)</Label>
                <Textarea value={scheduleNotes} onChange={(e) => setScheduleNotes(e.target.value)} maxLength={1000} rows={2} placeholder="Role, handover notes or coverage details" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>Cancel</Button>
            <Button
              disabled={!calendarStaff.data?.canManage || !scheduleStaffId || scheduleTitle.trim().length < 2 || !scheduleStart || !scheduleEnd || createSchedule.isPending}
              onClick={() => createSchedule.mutate()}
            >
              Create schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedAgendaBooking} onOpenChange={(open) => !open && setSelectedAgendaBooking(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reservation details</DialogTitle>
            <DialogDescription>Authoritative booking record · read-only calendar preview</DialogDescription>
          </DialogHeader>
          {selectedAgendaBooking && (
            <div className="space-y-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Guest</p><p className="font-medium">{selectedAgendaBooking.guest_name || "Guest"}</p></div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-muted-foreground">Reference</p><p>{selectedAgendaBooking.reference}</p></div>
                <div><p className="text-xs text-muted-foreground">Status</p><Badge variant="outline">{selectedAgendaBooking.status}</Badge></div>
                <div><p className="text-xs text-muted-foreground">Check-in</p><p>{formatEaDate(selectedAgendaBooking.check_in)}</p></div>
                <div><p className="text-xs text-muted-foreground">Check-out</p><p>{formatEaDate(selectedAgendaBooking.check_out)}</p></div>
              </div>
              <p className="text-xs text-muted-foreground">This drawer does not modify the reservation. Use the Reservations workspace for governed booking actions.</p>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setSelectedAgendaBooking(null)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Textarea placeholder="Notes (optional)" rows={2} value={blockNotes} onChange={(e) => setBlockNotes(e.target.value)} />
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
                  reason: [blockReason, blockNotes.trim()].filter(Boolean).join(": ").slice(0, 200) || undefined,
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