import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { updateRoomState } from "@/lib/operations.functions";
import { RoomStateChip, ROOM_STATES, type RoomStateValue } from "./RoomStateChip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type State = {
  id: string;
  unit_label: string;
  state: RoomStateValue;
  state_note: string | null;
  booking_id: string | null;
  room: { id: string; slug: string; name: string } | undefined;
  upcomingAllocations?: Array<{
    id: string;
    bookingId: string;
    reference: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    status: "reserved" | "checked_in";
    channel: { providerKey: string; externalReservationId: string; integrationStatus: string } | null;
  }>;
};

export function RoomStatusBoard({ states }: { states: State[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, State[]>();
    for (const s of states) {
      const key = s.room?.name ?? "Unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return Array.from(map.entries());
  }, [states]);

  return (
    <div className="space-y-6">
      {grouped.map(([roomName, units]) => (
        <div key={roomName}>
          <h3 className="mb-3 text-sm font-medium text-muted¶»§q«^