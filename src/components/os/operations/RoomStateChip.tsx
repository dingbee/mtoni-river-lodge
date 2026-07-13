import { cn } from "@/lib/utils";

export type RoomStateValue =
  | "vacant_clean" | "vacant_dirty" | "occupied" | "reserved"
  | "inspection" | "maintenance" | "out_of_service";

const STYLES: Record<RoomStateValue, { label: string; className: string }> = {
  vacant_clean:   { label: "Vacant clean",   className: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
  vacant_dirty:   { label: "Vacant dirty",   className: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  occupied:       { label: "Occupied",       className: "bg-blue-500/15 text-blue-700 border-blue-500/30" },
  reserved:       { label: "Reserved",       className: "bg-indigo-500/15 text-indigo-700 border-indigo-500/30" },
  inspection:     { label: "Inspection",     className: "bg-purple-500/15 text-purple-700 border-purple-500/30" },
  maintenance:    { label: "Maintenance",    className: "bg-orange-500/15 text-orange-700 border-orange-500/30" },
  out_of_service: { label: "Out of service", className: "bg-rose-500/15 text-rose-700 border-rose-500/30" },
};

export function RoomStateChip({ state, className }: { state: RoomStateValue; className?: string }) {
  const s = STYLES[state] ?? STYLES.vacant_clean;
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", s.className, className)}>
      {s.label}
    </span>
  );
}

export const ROOM_STATES: RoomStateValue[] = [
  "vacant_clean","vacant_dirty","occupied","reserved","inspection","maintenance","out_of_service",
];