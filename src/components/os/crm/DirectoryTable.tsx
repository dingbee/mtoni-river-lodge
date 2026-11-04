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

function GuestLink({ guest }: { guest: GuestRow }) {
  return (
    <Link
      to="/admin/guests/crm/$id"
      params={{ id: guest.id }}
      className="font-semibold text-foreground underline-offset-2 hover:underline focus-visible:underline"
    >
      {guest.full_name}
    </Link>
  );
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
    <>
      <div className="space-y-3 md:hidden">
        {rows.map((guest) => (
          <article key={guest.id} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="break-words text-sm"><GuestLink guest={guest} /></div>
                <div className="mt-1 break-all text-xs text-muted-foreground">{guest.email || "No email"}</div>
                <div className="mt-0.5 break-all text-xs text-muted-foreground">{guest.phone_e164 || "No phone"}</div>
              </div>
              <GuestStatusChip status={guest.status} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Country</p>
                <p className="break-words text-sm font-medium">{guest.country || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Last stay</p>
                <p className="text-sm font-medium">{fmtDate(guest.last_stay)}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Stays / nights</p>
                <p className="text-sm font-medium tabular-nums">{guest.total_stays} / {guest.total_nights}</p>
              </div>
              <div>
                <p className="text-[11px] text-muted-foreground">Lifetime spend</p>
                <p className="text-sm font-medium tabular-nums">{guest.lifetime_spend > 0 ? `$${guest.lifetime_spend.toLocaleString()}` : "—"}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
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
                <TableCell className="max-w-[220px] font-medium"><span className="break-words"><GuestLink guest={r} /></span></TableCell>
                <TableCell className="max-w-[240px] text-xs text-muted-foreground">
                  <div className="break-all">{r.email ?? "—"}</div>
                  <div className="break-all">{r.phone_e164 ?? ""}</div>
                </TableCell>
                <TableCell className="text-sm">{r.country ?? "—"}</TableCell>
                <TableCell><GuestStatusChip status={r.status} /></TableCell>
                <TableCell className="text-right tabular-nums">{r.total_stays}</TableCell>
                <TableCell className="text-right tabular-nums">{r.total_nights}</TableCell>
                <TableCell className="text-right tabular-nums">{r.lifetime_spend > 0 ? `$${r.lifetime_spend.toLocaleString()}` : "—"}</TableCell>
                <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.last_stay)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}