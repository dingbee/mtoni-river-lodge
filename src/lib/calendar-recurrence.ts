/** StayNas Phase 3 recurrence contracts. Local date/time values are interpreted in the property's IANA timezone. */

export type ScheduleFrequency = "daily" | "weekly";

export interface RecurringScheduleRule {
  startsOn: string;
  endsOn?: string | null;
  frequency: ScheduleFrequency;
  intervalCount: number;
  /** JavaScript weekday numbering: Sunday=0 through Saturday=6. */
  daysOfWeek?: number[];
  localStart: string;
  localEnd: string;
  timezone: string;
}

export interface ScheduleException {
  occurrenceDate: string;
  type: "cancelled" | "override";
  title?: string;
  startsAt?: string;
  endsAt?: string;
}

export interface ScheduleOccurrence {
  occurrenceDate: string;
  localStart: string;
  localEnd: string;
  timezone: string;
  title?: string;
  overridden: boolean;
}

/** Date-only arithmetic avoids UTC drift when evaluating daily/weekly rules. */
function parseDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("Expected ISO calendar date");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new Error("Invalid calendar date");
  return date;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayDifference(a: string, b: string): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / 86_400_000);
}

function weekday(value: string): number {
  return parseDate(value).getUTCDay();
}

/** Expand a bounded date range. This function never performs writes or mutates source records. */
export function expandRecurringSchedule(
  rule: RecurringScheduleRule,
  from: string,
  toExclusive: string,
  exceptions: ScheduleException[] = [],
  title?: string,
): ScheduleOccurrence[] {
  const start = parseDate(from);
  const end = parseDate(toExclusive);
  const anchor = parseDate(rule.startsOn);
  if (end <= start) throw new Error("Invalid schedule range");
  if (!Number.isInteger(rule.intervalCount) || rule.intervalCount < 1 || rule.intervalCount > 12) {
    throw new Error("Interval must be an integer between 1 and 12");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(rule.localStart) ||
      !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(rule.localEnd) ||
      rule.localEnd <= rule.localStart) {
    throw new Error("Invalid local time range");
  }
  if (!rule.timezone || !rule.timezone.includes("/")) throw new Error("An IANA timezone is required");
  if (rule.frequency === "weekly" && (!rule.daysOfWeek?.length ||
      rule.daysOfWeek.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) {
    throw new Error("Weekly schedules require valid weekdays");
  }
  const exceptionMap = new Map(exceptions.map((exception) => [exception.occurrenceDate, exception]));
  const output: ScheduleOccurrence[] = [];
  const first = dateString(start > anchor ? start : anchor);
  const finalRuleDate = rule.endsOn ? parseDate(rule.endsOn) : new Date(end.getTime() - 86_400_000);
  const last = dateString(finalRuleDate < new Date(end.getTime() - 86_400_000) ? finalRuleDate : new Date(end.getTime() - 86_400_000));

  for (let cursor = parseDate(first); dateString(cursor) <= last; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const date = dateString(cursor);
    const offset = dayDifference(date, rule.startsOn);
    if (offset < 0) continue;
    const matches = rule.frequency === "daily"
      ? offset % rule.intervalCount === 0
      : Math.floor(offset / 7) % rule.intervalCount === 0 && rule.daysOfWeek!.includes(weekday(date));
    if (!matches) continue;
    const exception = exceptionMap.get(date);
    if (exception?.type === "cancelled") continue;
    output.push({
      occurrenceDate: date,
      localStart: exception?.startsAt ?? `${date}T${rule.localStart}`,
      localEnd: exception?.endsAt ?? `${date}T${rule.localEnd}`,
      timezone: rule.timezone,
      title: exception?.title ?? title,
      overridden: exception?.type === "override",
    });
  }
  return output;
}
