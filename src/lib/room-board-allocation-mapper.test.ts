import { describe, expect, it } from "vitest";
import { mapRoomBoardAllocations } from "./room-board-allocation-mapper";

const booking = {
  id: "booking-1",
  reference: "STY-1001",
  guest_name: "Guest One",
  status: "confirmed" as const,
};
const allocation = {
  id: "allocation-1",
  booking_id: "booking-1",
  room_state_id: "room-state-1",
  check_in: "2026-11-15",
  check_out: "2026-11-18",
  allocation_status: "reserved" as const,
};

describe("mapRoomBoardAllocations", () => {
  it("joins channel reservation metadata to the correct physical room allocation", () => {
    const result = mapRoomBoardAllocations(
      [allocation],
      [booking],
      [
        {
          booking_id: "booking-1",
          provider_key: "channex",
          external_reservation_id: "CHX-88",
          integration_status: "integrated",
        },
      ],
    );

    expect(result.get("room-state-1")).toEqual([
      {
        id: "allocation-1",
        bookingId: "booking-1",
        reference: "STY-1001",
        guestName: "Guest One",
        checkIn: "2026-11-15",
        checkOut: "2026-11-18",
        status: "reserved",
        channel: {
          providerKey: "channex",
          externalReservationId: "CHX-88",
          integrationStatus: "integrated",
        },
      },
    ]);
  });

  it("keeps manually-created allocations valid without channel metadata", () => {
    const result = mapRoomBoardAllocations([allocation], [booking], []);
    expect(result.get("room-sta¶»§q«^