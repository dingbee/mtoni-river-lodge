import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOpsDashboard } from "@/lib/operations.functions";
import {
  ArrowLeftCircle, ArrowRightCircle, BedDouble, CheckCircle2, ClipboardList,
  Clock3, DollarSign, Percent, Sparkles, Users, Wrench, AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/operations/")({
  head: () => ({ meta: [{ title: "Operations Overview — StayNas" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: OpsDashboard,
});

function OpsDashboard() {
  const fn = useServerFn(getOpsDashboard);
  const q = useQuery({ queryKey: ["ops-dashboard"], queryFn: () => fn(), staleTime: 30_000, refetchInterval: 60_000 });
  const d: any = q.data ?? {};
  const t = d.today ?? {};

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-5 pb-6 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Property operations</p>
          <h1 className="mt-1 text-[25px] font-normal leading-tight tracking-[-0.035em] text-foreground sm:text-[29px]">Operations overview</h1>
          <p className="mt-1.5 text-sm font-normal text-muted-foreground">A clear view of what needs attention today.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs font-normal text-muted-foreground">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Updates every 60 seconds
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-[#263B52] bg-[#172B43] text-white shadow-sm">
        <div className="grid gap-5 p-4 sm:grid-cols-[1.1fr_1fr] sm:items-center sm:p-6">
          <div className="min-w-0">
            <p className="text-[11px] font-normal uppercase tracking-[0.16em] text-slate-300">Occupancy today</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-[42px] font-normal leading-none tracking-[-0.045em] tabular-nums sm:text-[48px]">{d.occupancyPct ?? 0}%</span>
              <span className="text-sm font-normal text-slate-300">occupied</span>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-[#C9AD7B]" style={{ width: `${Math.min(100, Math.max(0, Number(d.occupancyPct ?? 0)))}%` }} />
            </div>
            <p className="mt-2 text-xs font-normal text-slate-300">{d.totalRooms ?? 0} rooms in inventory</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
              <p className="text-xs font-normal text-slate-300">Arrivals</p>
              <p className="mt-1 text-2xl font-normal tabular-nums">{t.arrivals ?? 0}</p>
              <p className="mt-1 text-[11px] font-normal text-slate-400">{t.pending_check_in ?? 0} pending check-in</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
              <p className="text-xs font-normal text-slate-300">Departures</p>
              <p className="mt-1 text-2xl font-normal tabular-nums">{t.departures ?? 0}</p>
              <p className="mt-1 text-[11px] font-normal text-slate-400">{t.pending_check_out ?? 0} pending check-out</p>
            </div>
          </div>
        </div>
      </section>

      <section aria-label="Quick actions" className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Quick actions</h2>
          <span className="text-xs font-normal text-muted-foreground">Go to a workspace</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ActionLink to="/admin/operations/rooms" icon={BedDouble} label="Room board" />
          <ActionLink to="/admin/operations/arrivals" icon={Users} label="Arrivals" />
          <ActionLink to="/admin/operations/housekeeping" icon={Sparkles} label="Housekeeping" />
          <ActionLink to="/admin/operations/tasks" icon={ClipboardList} label="Tasks" />
        </div>
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Property status</h2>
          <Link to="/admin/operations/rooms" className="text-xs font-medium text-primary">View rooms</Link>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard label="In-house guests" value={t.in_house ?? 0} icon={Users} />
          <MetricCard label="Vacant and clean" value={t.vacant_rooms ?? 0} icon={BedDouble} tone="success" />
          <MetricCard label="Rooms to clean" value={t.dirty_rooms ?? 0} icon={Sparkles} tone="warn" />
          <MetricCard label="Maintenance" value={t.maintenance_rooms ?? 0} icon={Wrench} tone={t.maintenance_rooms ? "danger" : "default"} />
        </div>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <DataPanel title="Arrivals today" subtitle="Guests expected today">
          <BookingList items={d.arrivals} action="checkin" empty="No arrivals scheduled today." />
        </DataPanel>
        <DataPanel title="Departures today" subtitle="Guests checking out today">
          <BookingList items={d.departures} action="checkout" empty="No departures scheduled today." />
        </DataPanel>
        <DataPanel title="In-house guests" subtitle="Currently staying at the property">
          <BookingList items={d.inHouse} action="workspace" empty="No guests currently in-house." />
        </DataPanel>
        <DataPanel title="Outstanding balances" subtitle="Follow up before check-out" action={<Link to="/admin/operations/alerts" className="text-xs font-medium text-primary">View alerts</Link>}>
          {(!d.outstanding || d.outstanding.length === 0) ? (
            <p className="py-2 text-sm font-normal text-muted-foreground">All balances settled.</p>
          ) : (
            <ul className="divide-y divide-border">
              {d.outstanding.map((o: any) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <Link to="/admin/operations/reservations/$id" params={{ id: o.id }} className="truncate font-medium text-foreground hover:underline">{o.guest_name}</Link>
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">{o.reference} · {o.check_in} → {o.check_out}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium tabular-nums text-foreground">{o.currency} {Number(o.balance_amount).toFixed(2)}</p>
                    <p className="mt-0.5 text-xs font-normal text-muted-foreground">{o.payment_status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DataPanel>
      </section>

      <div className="flex items-center gap-2 border-t pt-3 text-xs font-normal text-muted-foreground">
        <Clock3 className="size-3.5" />
        <span>Dashboard data refreshes automatically.</span>
        <Link to="/admin/operations/alerts" className="ml-auto inline-flex items-center gap-1 text-primary">
          <AlertTriangle className="size-3.5" /> Alerts
        </Link>
      </div>
    </div>
  );
}

function ActionLink({ to, icon: Icon, label }: { to: string; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <Link to={to as any} className="group flex min-h-[68px] items-center gap-3 rounded-xl border bg-card px-3 py-3 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#172B43]/[0.07] text-[#263B52]">
        <Icon className="size-[18px]" />
      </span>
      <span className="text-sm font-medium text-foreground">{label}</span>
    </Link>
  );
}

function MetricCard({ label, value, icon: Icon, tone = "default" }: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "danger" | "success";
}) {
  const toneClass = tone === "warn" ? "text-amber-700" : tone === "danger" ? "text-red-700" : tone === "success" ? "text-emerald-700" : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-3.5 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-normal uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
        <Icon className="size-4 shrink-0 text-muted-foreground" />
      </div>
      <p className={`mt-2 text-[25px] font-normal leading-none tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

function DataPanel({ title, subtitle, action, children }: {
  title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4 sm:p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium tracking-[-0.01em] text-foreground">{title}</h2>
          <p className="mt-1 text-xs font-normal text-muted-foreground">{subtitle}</p>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function BookingList({ items, action, empty }: { items: any[]; action: "checkin" | "checkout" | "workspace"; empty: string }) {
  if (!items || items.length === 0) return <p className="py-2 text-sm font-normal text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((b) => (
        <li key={b.id} className="flex items-center justify-between gap-2 py-3 text-sm">
          <div className="min-w-0">
            <Link to="/admin/operations/reservations/$id" params={{ id: b.id }} className="truncate font-medium text-foreground hover:underline">{b.guest_name}</Link>
            <p className="mt-0.5 text-xs font-normal text-muted-foreground">{b.reference}</p>
          </div>
          {action === "checkin" && <Link to="/admin/operations/checkin/$id" params={{ id: b.id }} className="rounded-lg bg-[#172B43] px-3 py-2 text-xs font-medium text-white">Check in</Link>}
          {action === "checkout" && <Link to="/admin/operations/checkout/$id" params={{ id: b.id }} className="rounded-lg bg-[#172B43] px-3 py-2 text-xs font-medium text-white">Check out</Link>}
          {action === "workspace" && <Link to="/admin/operations/reservations/$id" params={{ id: b.id }} className="text-xs font-medium text-primary">Open</Link>}
        </li>
      ))}
    </ul>
  );
}
