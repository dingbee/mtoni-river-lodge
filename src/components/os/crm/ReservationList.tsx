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

export function ReservationList({ bookings }: { bookings: Booking[] }) {
  if (bookings.length === 0) {
    return <p className="text-sm text-muted-foreground">No reservations for this guest.</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reference</TableHead>
            <TableHead>Room</TableHead>
            <TableHead>Dates</TableHead>
            <TableHead>Nights</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.id}>
              <TableCell className="font-medium">
                <Link to="/admin/bookings" search={{ ref: b.reference } as any} className="hover:underline">
                  {b.reference}
                </Link>
              </TableCell>
              <TableCell>{b.room?.name ?? "—"}</TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(b.check_in).toLocaleDateString()} → {new Date(b.check_out).toLocaleDateString()}
              </TableCell>
              <TableCell>{b.nights}</TableCell>
              <TableCell><StatusChip tone={statusTone[b.status] ?? "neutral"}>{b.status.replace("_", " ")}</StatusChip></TableCell>
              <TableCell><StatusChip tone={b.payment_status === "paid" ? "success" : b.payment_status === "deposit_paid" ? "info" : b.payment_status === "refunded" ? "warning" : "neutral"}>{b.payment_status.replace("_", " ")}</StatusChip></TableCell>
              <TableCell className="text-right tabular-nums">
                {b.currency} {Number(b.total).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}