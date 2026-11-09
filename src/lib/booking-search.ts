export interface BookingSearch {
  step?: 1 | 2 | 3 | 4;
  session?: string;
  room?: string;
  check_in?: string;
  check_out?: string;
  adults?: number;
  children_below_6?: number;
  children_7_plus?: number;
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Accept only complete, internally consistent concierge booking handoff data. */
export function validateBookingSearch(search: Record<string, unknown>): BookingSearch {
  const rawStep = Number(search.step);
  const step: BookingSearch["step"] = rawStep === 2 || rawStep === 3 || rawStep === 4 ? rawStep : 1;
  const session = typeof search.session === "string" ? search.session : undefined;
  const room = typeof search.room === "string" ? search.room : undefined;
  const checkIn = isValidDate(search.check_in) ? search.check_in : undefined;
  const checkOut = isValidDate(search.check_out) ? search.check_out : undefined;
  const validDates = !!checkIn && !!checkOut && checkOut > checkIn;

  const adultsValue = Number(search.adults);
  const adults = Number.isInteger(adultsValue) && adultsValue >= 1 && adultsValue <= 10
    ? adultsValue
    : undefined;

  const below6 = Number(search.children_below_6);
  const plus7 = Number(search.children_7_plus);
  const totalChildren = Number(search.children);
  const validChildBuckets =
    Number.isInteger(below6) && below6 >= 0 && below6 <= 10 &&
    Number.isInteger(plus7) && plus7 >= 0 && plus7 <= 10 &&
    below6 + plus7 <= 10 &&
    (!Number.isInteger(totalChildren) || totalChildren === below6 + plus7);

  return {
    step,
    session,
    room,
    check_in: validDates ? checkIn : undefined,
    check_out: validDates ? checkOut : undefined,
    adults,
    children_below_6: validChildBuckets ? below6 : undefined,
    children_7_plus: validChildBuckets ? plus7 : undefined,
  };
}
