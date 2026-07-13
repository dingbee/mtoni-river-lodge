import { Link } from "@tanstack/react-router";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GuestStatusChip } from "./GuestStatusChip";

export type GuestRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone_e164: string | null;
  country: string | null;
  status: string;
  total_stays: number;
  total_nights: number;
  lifetime_spend: number;
  first_stay: string | null;
  last_stay: string | null;
  communication_preference: string;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function DirectoryTable({ rows }: { rows: GuestRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        No guests match your filters yet.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Guest</TableHead>
            <TableHead scope="col">Contact</TableHead>
            <TableHead scope="col">Country</TableHead>
            <TableHead scope="col">Status</TableHead>
            <TableHead scope="col" className="text-right">Stays</TableHead>
            <TableHead scope="col" className="text-right">Nights</TableHead>
            <TableHead scope="col" className="text-right">Lifetime</TableHead>
            <TableHead scope="col">Last stay</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className="focus-within:bg-muted/50">
              <TableCell className="font-medium">
                <Link
                  to="/admin/guests/crm/$id"
                  params={{ id: r.id }}
                  className="text-foreground underline-offset-2 hover:underline focus-visible:underline"
                >
                  {r.full_name}
                </Link>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                <div>{r.email ?? "—"}</div>
                <div>{r.phone_e164 ?? ""}</div>
              </TableCell>
              <TableCell className="text-sm">{r.country ?? "—"}</TableCell>
              <TableCell><GuestStatusChip status={r.status} /></TableCell>
              <TableCell className="text-right tabular-nums">{r.total_stays}</TableCell>
              <TableCell className="text-right tabular-nums">{r.total_nights}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.lifetime_spend > 0 ? `$${r.lifetime_spend.toLocaleString()}` : "—"}
              </TableCell>
              <TableCell className="text-sm">{fmtDate(r.last_stay)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}