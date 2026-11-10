import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { manageRoomUnit, updateRoomState } from "@/lib/operations.functions";
import { RoomStateChip, ROOM_STATES, type RoomStateValue } from "./RoomStateChip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Room = { id: string; slug: string; name: string };
type State = {
  id: string;
  room_id: string;
  unit_label: string;
  state: RoomStateValue;
  state_note: string | null;
  booking_id: string | null;
  room: Room | undefined;
};

export function RoomStatusBoard({ states, rooms = [] }: { states: State[]; rooms?: Room[] }) {
  const grouped = useMemo(() => {
    const map = new Map<string, { room: Room; units: State[] }>();
    for (const room of rooms) map.set(room.id, { room, units: [] });
    for (const state of states) {
      const room = state.room ?? { id: state.room_id, slug: "unassigned", name: "Unassigned" };
      if (!map.has(room.id)) map.set(room.id, { room, units: [] });
      map.get(room.id)!.units.push(state);
    }
    return Array.from(map.values()).sort((a, b) => a.room.name.localeCompare(b.room.name));
  }, [states, rooms]);

  return (
    <div className="space-y-6">
      {grouped.map(({ room, units }) => (
        <section key={room.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">{room.name}</h3>
              <p className="text-xs text-muted-foreground">{units.length} physical units</p>
            </div>
            <AddRoomUnit room={room} existingCount={units.length} />
          </div>
          {units.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No physical units yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {units.map((unit) => <RoomStateCard key={unit.id} unit={unit} room={room} />)}
            </div>
          )}
        </section>
      ))}
      {grouped.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Create a room type in Room Configuration to begin managing physical units.</p>
      )}
    </div>
  );
}

function AddRoomUnit({ room, existingCount }: { room: Room; existingCount: number }) {
  const [label, setLabel] = useState(`${room.slug}-${String(existingCount + 1).padStart(2, "0")}`);
  const qc = useQueryClient();
  const manage = useServerFn(manageRoomUnit);
  const mutation = useMutation({
    mutationFn: () => manage({ data: { action: "create", roomId: room.id, unitLabel: label.trim() } }),
    onSuccess: () => {
      toast.success("Physical unit added");
      qc.invalidateQueries({ queryKey: ["ops-room-board"] });
      qc.invalidateQueries({ queryKey: ["ops-dashboard"] });
      setLabel(`${room.slug}-${String(existingCount + 2).padStart(2, "0")}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <div className="flex items-center gap-2">
      <input aria-label={`New unit label for ${room.name}`} value={label} onChange={(event) => setLabel(event.target.value)}
        className="h-9 w-36 rounded-md border bg-background px-2 text-xs" maxLength={80} />
      <button type="button" disabled={mutation.isPending || !label.trim()} onClick={() => mutation.mutate()}
        className="h-9 rounded-md border px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
        {mutation.isPending ? "Adding…" : "Add unit"}
      </button>
    </div>
  );
}

function RoomStateCard({ unit, room }: { unit: State; room: Room }) {
  const [state, setState] = useState<RoomStateValue>(unit.state);
  const [label, setLabel] = useState(unit.unit_label);
  const qc = useQueryClient();
  const update = useServerFn(updateRoomState);
  const manage = useServerFn(manageRoomUnit);
  const stateMutation = useMutation({
    mutationFn: (next: RoomStateValue) => update({ data: { id: unit.id, state: next } }),
    onSuccess: () => {
      toast.success("Room state updated");
      qc.invalidateQueries({ queryKey: ["ops-room-board"] });
      qc.invalidateQueries({ queryKey: ["ops-dashboard"] });
    },
    onError: (error: Error) => {
      setState(unit.state);
      toast.error(error.message);
    },
  });
  const unitMutation = useMutation({
    mutationFn: (action: "rename" | "delete") => manage({
      data: { action, roomId: room.id, unitId: unit.id, unitLabel: action === "rename" ? label.trim() : undefined },
    }),
    onSuccess: (_result, action) => {
      toast.success(action === "rename" ? "Unit label updated" : "Physical unit removed");
      qc.invalidateQueries({ queryKey: ["ops-room-board"] });
      qc.invalidateQueries({ queryKey: ["ops-dashboard"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const canDelete = !unit.booking_id && ["vacant_clean", "vacant_dirty"].includes(unit.state);
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="text-sm font-medium">{unit.unit_label}</div>
        <RoomStateChip state={state} />
      </div>
      <Select value={state} onValueChange={(value) => { setState(value as RoomStateValue); stateMutation.mutate(value as RoomStateValue); }}>
        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {ROOM_STATES.map((value) => <SelectItem key={value} value={value} className="text-xs">{value.replace(/_/g, " ")}</SelectItem>)}
        </SelectContent>
      </Select>
      {unit.state_note && <p className="mt-2 text-xs text-muted-foreground">{unit.state_note}</p>}
      <div className="mt-3 flex gap-2">
        <input aria-label={`Unit label ${unit.unit_label}`} value={label} onChange={(event) => setLabel(event.target.value)}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs" maxLength={80} />
        <button type="button" disabled={unitMutation.isPending || !label.trim() || label.trim() === unit.unit_label || !!unit.booking_id}
          onClick={() => unitMutation.mutate("rename")} className="rounded-md border px-2 text-xs hover:bg-muted disabled:opacity-40">Save</button>
        <button type="button" disabled={unitMutation.isPending || !canDelete}
          onClick={() => unitMutation.mutate("delete")} className="rounded-md border border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-40">Remove</button>
      </div>
    </div>
  );
}
