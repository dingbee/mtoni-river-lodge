import { Link } from "@tanstack/react-router";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip, type StatusTone } from "@/components/os/StatusChip";

type Booking = {
  id: string;
  reference: string;
  check_in: string;
  check_out: string;
  nights: number;
  status: string;
  payment_status: string;
  total: number;
  currency: string;
  paid_amount: number | null;
  room?: { name: string; slug: string } | null;
};

const statusTone: Record<string, StatusTone> = {
  pending: "warning",
  confirmed: "success",
  cancelled: "danger",
  completed: "neutral",
  no_show: "danger",
  checked_in: "info",
};

function paymentTone(status: string): StatusTone {
  if (status === "paid") return "success";
  if (status === "deposit_paid") return "info";
  if (status === "refunded") return "warning";
  return "neutral";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function ReservationList({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return <p className="text-sm text-muted-foreground">No reservations for this guest.</p>;
  }

  return (
    <div className="min-w-0">
      {/* Compact stacked records on phones; preserve the full data table on wider screens. */}
      <div className="space-y-3 md:hidden">
        {bookings.map((b) => (
          <article key={b.id} className="min-w-0 rounded-lg border bg-card p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <Link
                  to="/admin/bookings"
                  search={{ ref: b.reference } as any}
                  className="break-all text-sm font-semibold hover:underline"
                >
                  {b.reference}
                </Link>
                <p className="mt-1 break-words text-sm text-muted-foreground">{b.room?.name ?? "Room not specified"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">{b.currency} {Number(b.total).toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">{b.nights} {b.nights === 1 ? "night" : "nights"}</p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t pt-3 text-sm">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Check-in</p>
                <p className="mt-1 font-medium">{formatDate(b.check_in)}</p>
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Check-out</p>
                <p className="mt-1 font-medium">{formatDate(b.check_out)}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              <StatusChip tone={statusTone[b.status] ?? "neutral"}>{b.status.replace("_", " ")}</StatusChip>
              <StatusChip tone={paymentTone(b.payment_status)}>{b.payment_status.replace("_", " ")}</StatusChip>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden min-w-0 overflow-x-auto rounded-lg border bg-card md:block">
        <Table className="min-w-[900px] table-auto">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Reference</TableHead>
              <TableHead className="whitespace-nowrap">Room</TableHead>
              <TableHead className="whitespace-nowrap">Dates</TableHead>
              <TableHead className="whitespace-nowrap">Nights</TableHead>
              <TableHead className="whitespace-nowrap">Status</TableHead>
              <TableHead className="whitespace-nowrap">Payment</TableHead>
              <TableHead className="whitespace-nowrap text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="whitespace-nowrap font-medium">
                  <Link to="/admin/bookings" search={{ ref: b.reference } as any} className="hover:underline">
                    {b.reference}
                  </Link>
                </TableCell>
                <TableCell className="whitespace-nowrap">{b.room?.name ?? "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {formatDate(b.check_in)} → {formatDate(b.check_out)}
                </TableCell>
                <TableCell>{b.nights}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusChip tone={statusTone[b.status] ?? "neutral"}>{b.status.replace("_", " ")}</StatusChip>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <StatusChip tone={paymentTone(b.payment_status)}>{b.payment_status.replace("_", " ")}</StatusChip>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {b.currency} {Number(b.total).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
