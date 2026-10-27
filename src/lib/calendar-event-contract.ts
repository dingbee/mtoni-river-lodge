/**
 * StayNas Enterprise Calendar — shared event contract.
 *
 * This is an application-level contract for normalized calendar items.
 * It deliberately does not replace authoritative booking, room, task or
 * maintenance records and does not require a production schema change.
 */

export type CalendarEventKind =
  | "reservation"
  | "arrival"
  | "departure"
  | "housekeeping"
  | "maintenance"
  | "staff"
  | "blocked"
  | "hold"
  | "task"
  | "conflict"
  | "custom";

export type CalendarEventStatus =
  | "tentative"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "blocked"
  | "conflict";

export type CalendarResourceKind = "room" | "staff" | "team" | "property" | "other";

/** Calendar ranges are ISO dates for all-day items and ISO timestamps for timed items. */
export interface StayNasCalendarEvent {
  id: string;
  propertyId: string;
  kind: CalendarEventKind;
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  timezone: string;
  status: CalendarEventStatus;
  source: {
    domain: "reservations" | "rooms" | "housekeeping" | "maintenance" | "staff" | "automation" | "calendar";
    entityType: string;
    entityId: string;
  };
  resource?: {
    kind: CalendarResourceKind;
    id: string;
    label: string;
  };
  href?: string;
  description?: string;
  metadata?: Record<string, unknown>;
  conflictIds?: string[];
  editable: boolean;
}

/** Half-open intervals: [start, end). Check-out is not an occupied night. */
export function calendarIntervalsOverlap(
  a: Pick<StayNasCalendarEvent, "start" | "end">,
  b: Pick<StayNasCalendarEvent, "start" | "end">,
): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Returns conflicting event pairs when the same resource is double-booked. */
export function findCalendarConflicts(events: StayNasCalendarEvent[]): Array<[string, string]> {
  const conflicts: Array<[string, string]> = [];
  const active = events.filter((event) =>
    event.resource &&
    event.status !== "cancelled" &&
    event.status !== "completed",
  );
  for (let i = 0; i < active.length; i += 1) {
    for (let j = i + 1; j < active.length; j += 1) {
      const a = active[i];
      const b = active[j];
      if (
        a.propertyId === b.propertyId &&
        a.resource?.kind === b.resource?.kind &&
        a.resource?.id === b.resource?.id &&
        calendarIntervalsOverlap(a, b)
      ) {
        conflicts.push([a.id, b.id]);
      }
    }
  }
  return conflicts;
}
