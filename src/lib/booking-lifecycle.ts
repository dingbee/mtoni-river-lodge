export type BookingLifecycleStatus =
  | "pending"
  | "confirmed"
  | "checked_in"
  | "completed"
  | "cancelled"
  | "no_show";

export type BookingLifecycleAction = Exclude<BookingLifecycleStatus, "pending">;

const ALLOWED_TRANSITIONS: Record<BookingLifecycleStatus, BookingLifecycleAction[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["completed"],
  completed: [],
  cancelled: [],
  no_show: [],
};

export function getAllowedBookingTransitions(
  status: BookingLifecycleStatus,
): BookingLifecycleAction[] {
  return [...ALLOWED_TRANSITIONS[status]];
}

export function canTransitionBooking(
  from: BookingLifecycleStatus,
  to: BookingLifecycleStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to as BookingLifecycleAction);
}
