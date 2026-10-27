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
