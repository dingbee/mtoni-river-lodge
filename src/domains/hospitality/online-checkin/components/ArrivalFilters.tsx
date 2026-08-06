import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ARRIVAL_SCOPES,
  CHECKIN_STATUS_FILTERS,
  CHECKIN_STATUS_FILTER_LABEL,
  DOCUMENT_STATUS_FILTERS,
  DOCUMENT_STATUS_LABEL,
  RESERVATION_STATUS_FILTERS,
  type ArrivalsFilter,
} from "../services/arrivals-shared";

const SCOPE_LABEL: Record<(typeof ARRIVAL_SCOPES)[number], string> = {
  today: "Today",
  upcoming: "Upcoming (30d)",
  week: "Next 7 days",
  range: "Custom range",
};

const ALL = "__all";

export function ArrivalFilters({
  filters,
  rooms,
  onChange,
}: {
  filters: ArrivalsFilter;
  rooms: { id: string; name: string }[];
  onChange: (next: ArrivalsFilter) => void;
}) {
  const set = (patch: Partial<ArrivalsFilter>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="h-9 pl-8"
          placeholder="Search guest name, reference or email"
          value={filters.search ?? ""}
          onChange={(e) => set({ search: e.target.value })}
        />
      </div>

      <Select
        value={filters.scope}
        onValueChange={(v) => set({ scope: v as ArrivalsFilter["scope"] })}
      >
        <SelectTrigger className="h-9 w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ARRIVAL_SCOPES.map((s) => (
            <SelectItem key={s} value={s}>
              {SCOPE_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filters.scope === "range" && (
        <>
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={filters.from ?? ""}
            onChange={(e) => set({ from: e.target.value || undefined })}
          />
          <Input
            type="date"
            className="h-9 w-[150px]"
            value={filters.to ?? ""}
            onChange={(e) => set({ to: e.target.value || undefined })}
          />
        </>
      )}

      <Select
        value={filters.checkinStatus ?? ALL}
        onValueChange={(v) =>
          set({ checkinStatus: v === ALL ? undefined : (v as ArrivalsFilter["checkinStatus"]) })
        }
      >
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue placeholder="Check-in" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All check-in states</SelectItem>
          {CHECKIN_STATUS_FILTERS.map((s) => (
            <SelectItem key={s} value={s}>
              {CHECKIN_STATUS_FILTER_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.documentStatus ?? ALL}
        onValueChange={(v) =>
          set({ documentStatus: v === ALL ? undefined : (v as ArrivalsFilter["documentStatus"]) })
        }
      >
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue placeholder="Documents" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All documents</SelectItem>
          {DOCUMENT_STATUS_FILTERS.map((s) => (
            <SelectItem key={s} value={s}>
              {DOCUMENT_STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.reservationStatus ?? ALL}
        onValueChange={(v) =>
          set({
            reservationStatus: v === ALL ? undefined : (v as ArrivalsFilter["reservationStatus"]),
          })
        }
      >
        <SelectTrigger className="h-9 w-[150px]">
          <SelectValue placeholder="Reservation" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All reservations</SelectItem>
          {RESERVATION_STATUS_FILTERS.map((s) => (
            <SelectItem key={s} value={s}>
              {s.replace("_", " ")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.roomId ?? ALL}
        onValueChange={(v) => set({ roomId: v === ALL ? undefined : v })}
      >
        <SelectTrigger className="h-9 w-[170px]">
          <SelectValue placeholder="Room" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All rooms</SelectItem>
          {rooms.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
