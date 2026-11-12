export type RoomBoardBooking = {
  id: string;
  reference: string;
  guest_name: string;
  status: "confirmed" | "checked_in";
};

export type RoomBoardAllocation = {
  id: string;
  booking_id: string;
  room_state_id: string;
  check_in: string;
  check_out: string;
  allocation_status: "reserved" | "checked_in";
};

export type RoomBoardOperationalReservation = {
  booking_id: string;
  provider_key: string;
  external_reservation_id: string;
  integration_status: string;
};

export type RoomBoardUpcomingAllocation = {
  id: string;
  bookingId: string;
  reference: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: "reserved" | "checked_in";
  channel: {
    providerKey: string;
    externalReservationId: string;
    integrationStatus: string;
  } | null;
};

/** Join the property-scoped allocation, booking, and service-only channel projection read models. */
export function mapRoomBoardAllocations(
  allocations: RoomBoardAllocation[],
  bookings: RoomBoardBooking[],
  operationalReservations: RoomBoardOperationalReservation[],
): Map<string, RoomBoardUpcomingAllocation[]> {
  const bookingsById = new Map(bookings.map((booking) => [booking.id, booking]));
  const channelByBookingId = new Map(
    operationalReservations.map((reservation) => [reservation.booking_id, reservation]),
  );
  const byRoomState = new Map<string, RoomBoardUpcomingAllocation[]>();

  for (const allocation of allocations) {
    const booking = bookingsById.get(allocatio¶»§q«^