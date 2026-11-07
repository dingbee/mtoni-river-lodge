import { useMemo, useState } from "react";
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
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">{roomName}</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {units.map((u) => <RoomStateCard key={u.id} unit={u} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoomStateCard({ unit }: { unit: State }) {
  const [state, setState] = useState<RoomStateValue>(unit.state);
  const qc = useQueryClient();
  const fn = useServerFn(updateRoomState);
  const m = useMutation({
    mutationFn: (next: RoomStateValue) => fn({ data: { id: unit.id, state: next } }),
    onSuccess: () => {
      toast.success("Room state updated");
      qc.invalidateQueries({ queryKey: ["ops-room-board"] });
      qc.invalidateQueries({ queryKey: ["ops-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="text-sm font-medium">{unit.unit_label}</div>
        <RoomStateChip state={state} />
      </div>
      <Select value={state} onValueChange={(v) => { setState(v as RoomStateValue); m.mutate(v as RoomStateValue); }}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ROOM_STATES.map((s) => (<SelectItem key={s} value={s} className="text-xs">{s.replace(/_/g, " ")}</SelectItem>))}
        </SelectContent>
      </Select>
      {unit.state_note && <p className="mt-2 text-xs text-muted-foreground">{unit.state_note}</p>}
      {(unit.upcomingAllocations?.length ?? 0) > 0 && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Upcoming stays</p>
          {unit.upcomingAllocations!.map((allocation) => (
            <div key={allocation.id} className="rounded-md bg-muted/50 px-2 py-1.5">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium">{allocation.reference}</span>
                <span className="text-muted-foreground">{allocation.status.replace("_", " ")}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {allocation.guestName} · {allocation.checkIn} – {allocation.checkOut}
              </p>
              {allocation.channel && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {allocation.channel.providerKey} · {allocation.channel.integrationStatus.replace(/_/g, " ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}