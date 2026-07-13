import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOpsDashboard } from "@/lib/operations.functions";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { KpiCard } from "@/components/os/operations/KpiCard";
import {
  ArrowRightCircle, ArrowLeftCircle, Users, BedDouble, Sparkles, Wrench, DollarSign, Percent, Clock, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/operations/")({
  head: () => ({ meta: [{ title: "Operations Dashboard — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: OpsDashboard,
});

function OpsDashboard() {
  const fn = useServerFn(getOpsDashboard);
  const q = useQuery({ queryKey: ["ops-dashboard"], queryFn: () => fn(), staleTime: 30_000, refetchInterval: 60_000 });
  const d: any = q.data ?? {};
  const t = d.today ?? {};

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations Centre"
        description="Everything reception needs to run today, in one screen."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Occupancy" value={`${d.occupancyPct ?? 0}%`} hint={`${t.occupied_rooms ?? 0}/${d.totalRooms ?? 0} rooms`} icon={Percent} />
        <KpiCard label="Arrivals today" value={t.arrivals ?? 0} hint={`${t.pending_check_in ?? 0} pending check-in`} icon={ArrowRightCircle} />
        <KpiCard label="Departures today" value={t.departures ?? 0} hint={`${t.pending_check_out ?? 0} pending check-out`} icon={ArrowLeftCircle} />
        <KpiCard label="In-house guests" value={t.in_house ?? 0} icon={Users} />
        <KpiCard label="Vacant clean" value={t.vacant_rooms ?? 0} icon={BedDouble} tone="success" />
        <KpiCard label="Dirty rooms" value={t.dirty_rooms ?? 0} icon={Sparkles} tone="warn" />
        <KpiCard label="Maintenance" value={t.maintenance_rooms ?? 0} icon={Wrench} tone={t.maintenance_rooms ? "danger" : "default"} />
        <KpiCard label="Outstanding balances" value={`$${Number(t.outstanding_total ?? 0).toFixed(0)}`} icon={DollarSign} tone={Number(t.outstanding_total ?? 0) > 0 ? "warn" : "default"} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="ADR" value="—" hint="Avg daily rate (placeholder)" />
        <KpiCard label="RevPAR" value="—" hint="Revenue / available room" />
        <KpiCard label="Average stay" value="—" hint="Nights per booking" />
        <KpiCard label="Cancellation rate" value="—" hint="Last 30 days" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Arrivals today" description="Confirm & check in">
          <BookingList items={d.arrivals} action="checkin" empty="No arrivals scheduled today." />
        </SectionCard>
        <SectionCard title="Departures today" description="Complete check-out">
          <BookingList items={d.departures} action="checkout" empty="No departures today." />
        </SectionCard>
        <SectionCard title="In-house guests" description="Currently staying">
          <BookingList items={d.inHouse} action="workspace" empty="No guests currently in-house." />
        </SectionCard>
      </div>

      <SectionCard title="Outstanding balances" description="Follow up before check-out">
        {(!d.outstanding || d.outstanding.length === 0) ? (
          <p className="text-sm text-muted-foreground">All balances settled.</p>
        ) : (
          <ul className="divide-y">
            {d.outstanding.map((o: any) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <Link to="/admin/operations/reservations/$id" params={{ id: o.id }} className="font-medium hover:underline">{o.guest_name}</Link>
                  <div className="text-xs text-muted-foreground">{o.reference} · {o.check_in} → {o.check_out}</div>
                </div>
                <div className="text-right">
                  <div className="tabular-nums font-semibold text-amber-700">{o.currency} {Number(o.balance_amount).toFixed(2)}</div>
                  <div className="text-xs text-muted-foreground">{o.payment_status}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Clock className="size-3" /> Refreshes automatically every 60s.
        <Link to="/admin/operations/alerts" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"><AlertTriangle className="size-3" /> View alerts</Link>
      </div>
    </div>
  );
}

function BookingList({ items, action, empty }: { items: any[]; action: "checkin" | "checkout" | "workspace"; empty: string }) {
  if (!items || items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {items.map((b) => (
        <li key={b.id} className="flex items-center justify-between gap-2 py-2 text-sm">
          <div className="min-w-0">
            <Link to="/admin/operations/reservations/$id" params={{ id: b.id }} className="font-medium hover:underline">{b.guest_name}</Link>
            <div className="text-xs text-muted-foreground">{b.reference}</div>
          </div>
          {action === "checkin" && (
            <Link to="/admin/operations/checkin/$id" params={{ id: b.id }} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">Check in</Link>
          )}
          {action === "checkout" && (
            <Link to="/admin/operations/checkout/$id" params={{ id: b.id }} className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground">Check out</Link>
          )}
          {action === "workspace" && (
            <Link to="/admin/operations/reservations/$id" params={{ id: b.id }} className="text-xs text-primary hover:underline">Open</Link>
          )}
        </li>
      ))}
    </ul>
  );
}