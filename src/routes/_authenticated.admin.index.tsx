import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCrmDashboard } from "@/lib/guests.functions";
import { getDashboardIntelligence } from "@/lib/guest-intelligence.functions";
import { getOpsDashboard } from "@/lib/operations.functions";
import { getRevenueDashboard } from "@/domains/finance/finance.functions";
import {
  BedDouble,
  CalendarCheck,
  CalendarX,
  Clock,
  DollarSign,
  Star,
  LineChart,
  Bell,
  Users,
  Crown,
  Repeat,
  Home,
  Sparkles,
  Gauge,
  TrendingUp,
  Wallet,
  ClipboardCheck,
  Wrench,
} from "lucide-react";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { GuestStatusChip } from "@/components/os/crm/GuestStatusChip";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Command Centre — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: CommandCentrePage,
});

function money(n: number, currency = "USD") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(n || 0);
  } catch {
    return `$${Math.round(n || 0).toLocaleString()}`;
  }
}

function CommandCentrePage() {
  const opsFn = useServerFn(getOpsDashboard);
  const opsQ = useQuery({ queryKey: ["os-ops"], queryFn: () => opsFn(), staleTime: 60_000, refetchInterval: 120_000 });
  const revFn = useServerFn(getRevenueDashboard);
  const revQ = useQuery({ queryKey: ["os-rev"], queryFn: () => revFn({ data: {} } as any), staleTime: 120_000 });
  const crmFn = useServerFn(getCrmDashboard);
  const crmQ = useQuery({ queryKey: ["crm-dashboard"], queryFn: () => crmFn(), staleTime: 60_000 });
  const intelFn = useServerFn(getDashboardIntelligence);
  const intelQ = useQuery({ queryKey: ["crm-intelligence"], queryFn: () => intelFn(), staleTime: 60_000 });

  const ops: any = opsQ.data ?? {};
  const rev: any = revQ.data ?? {};
  const crm: any = crmQ.data ?? { recent: [], returning: [], vip: [], arrivals: [] };
  const isInitialLoading = opsQ.isLoading && revQ.isLoading && crmQ.isLoading;
  const kpiHint = (v: string) => (opsQ.isLoading || revQ.isLoading ? "Loading…" : v);
  const intel: any = intelQ.data ?? {
    vipArrivals: [], birthdays: [], anniversaries: [], topCountries: [], topLifetime: [], acquisitionTrend: [],
  };
  const today = ops.today ?? {};
  const totalRooms: number = ops.totalRooms ?? 0;
  const inHouse: number = today.in_house ?? (ops.inHouse?.length ?? 0);
  const arrivals: number = today.arrivals ?? (ops.arrivals?.length ?? 0);
  const departures: number = today.departures ?? (ops.departures?.length ?? 0);
  const occupied: number = today.occupied_rooms ?? 0;
  const available: number = Math.max(0, totalRooms - occupied);
  const occupancyPct: number = ops.occupancyPct ?? 0;
  const outstanding: number = Number(today.outstanding_total ?? rev.outstanding ?? 0);
  const revenueMtd: number = Number(rev.mtdRevenue ?? 0);
  const revenueToday: number = Number(rev.todayRevenue ?? 0);
  const adr: number = Number(rev.adr ?? 0);
  const revpar: number = Number(rev.revpar ?? 0);
  const dirty: number = today.dirty_rooms ?? 0;
  const maintenance: number = today.maintenance_rooms ?? 0;

  const now = new Date();
  const dateLong = now.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const hour = now.getHours();
  const greeting = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-8">
      {/* Command Centre header */}
      <header className="os-fade-in flex flex-wrap items-end justify-between gap-4 border-b border-[color:var(--os-hairline)] pb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-[color:var(--os-ink-3)]">
            <Sparkles className="size-3.5 text-[color:var(--os-gold)]" /> Command Centre
          </div>
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight text-[color:var(--os-ink)] lg:text-5xl">
            {greeting}.
          </h1>
          <p className="mt-2 text-sm text-[color:var(--os-ink-3)]">{dateLong} · Live operational snapshot.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="os-chip"><span className="size-1.5 rounded-full bg-[color:var(--os-success)]" /> Live</span>
          <span className="os-chip">{totalRooms} rooms</span>
          <Link
            to="/admin/operations"
            className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--os-ink)] px-3.5 py-1.5 text-xs font-medium text-[color:var(--os-surface)] transition-opacity hover:opacity-90"
          >
            Open Operations
          </Link>
        </div>
      </header>

      {/* Primary KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Occupancy" value={opsQ.isLoading ? "—" : `${occupancyPct}%`} hint={kpiHint(`${occupied}/${totalRooms} rooms occupied`)} icon={Gauge} />
        <StatCard label="In-house" value={opsQ.isLoading ? "—" : inHouse} hint={kpiHint("Guests staying tonight")} icon={Users} />
        <StatCard label="Arrivals" value={opsQ.isLoading ? "—" : arrivals} hint={kpiHint("Today")} icon={CalendarCheck} />
        <StatCard label="Departures" value={opsQ.isLoading ? "—" : departures} hint={kpiHint("Today")} icon={CalendarX} />
      </div>

      {/* Revenue + performance row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue MTD" value={revQ.isLoading ? "—" : money(revenueMtd)} hint={kpiHint(`Today ${money(revenueToday)}`)} icon={DollarSign} />
        <StatCard label="ADR" value={revQ.isLoading ? "—" : money(adr)} hint={kpiHint("Average daily rate")} icon={TrendingUp} />
        <StatCard label="RevPAR" value={revQ.isLoading ? "—" : money(revpar)} hint={kpiHint("Rev per available room")} icon={LineChart} />
        <StatCard label="Outstanding" value={revQ.isLoading ? "—" : money(outstanding)} hint={kpiHint("Pending balances")} icon={Wallet} />
      </div>

      {/* Operational widgets row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Available" value={available} hint="Rooms tonight" icon={Home} />
        <StatCard label="Housekeeping" value={dirty} hint="Rooms to clean" icon={ClipboardCheck} />
        <StatCard label="Maintenance" value={maintenance} hint="Off-inventory" icon={Wrench} />
        <StatCard label="Pending" value={today.pending_check_in ?? 0} hint="Awaiting check-in" icon={Clock} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Upcoming arrivals" description="Next 7 days" className="lg:col-span-2">
          {crm.arrivals.length === 0 ? (
            <EmptyState title="No upcoming arrivals" description="Confirmed and pending bookings will appear here." />
          ) : (
            <ul className="divide-y divide-[color:var(--os-hairline)]">
              {crm.arrivals.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-[color:var(--os-ink)]">{a.guest_name}</div>
                    <div className="text-xs text-[color:var(--os-ink-3)]">{a.reference} · {new Date(a.check_in).toLocaleDateString()} → {new Date(a.check_out).toLocaleDateString()}</div>
                  </div>
                  {a.guest_id && (
                    <Link to="/admin/guests/crm/$id" params={{ id: a.guest_id }} className="text-xs text-[color:var(--os-green)] hover:underline">
                      Profile
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Recent guests" description="Newly added to the CRM">
          <GuestList items={crm.recent} />
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Returning guests" description="≥ 2 stays">
          <GuestList items={crm.returning} icon={Repeat} />
        </SectionCard>
        <SectionCard title="VIP guests" description="Priority hospitality">
          <GuestList items={crm.vip} icon={Crown} />
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="VIP arrivals today" description="Prioritise the welcome">
          {intel.vipArrivals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No VIP arrivals today.</p>
          ) : (
            <ul className="divide-y">
              {intel.vipArrivals.map((a: any) => (
                <li key={a.id} className="py-2 text-sm">
                  <Link to="/admin/guests/crm/$id" params={{ id: a.guest_id }} className="font-medium hover:underline">
                    {a.guest?.full_name ?? a.guest_name}
                  </Link>
                  <div className="text-xs text-muted-foreground">{a.reference}</div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Birthdays this week" description="Celebrate every guest">
          {intel.birthdays.length === 0 ? (
            <p className="text-sm text-muted-foreground">No birthdays this week.</p>
          ) : (
            <ul className="divide-y">
              {intel.birthdays.map((g: any) => (
                <li key={g.id} className="flex justify-between py-2 text-sm">
                  <Link to="/admin/guests/crm/$id" params={{ id: g.id }} className="hover:underline">{g.full_name}</Link>
                  <span className="text-xs text-muted-foreground">{new Date(g.birthday).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Anniversaries this week" description="Personal touch matters">
          {intel.anniversaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No anniversaries this week.</p>
          ) : (
            <ul className="divide-y">
              {intel.anniversaries.map((g: any) => (
                <li key={g.id} className="flex justify-between py-2 text-sm">
                  <Link to="/admin/guests/crm/$id" params={{ id: g.id }} className="hover:underline">{g.full_name}</Link>
                  <span className="text-xs text-muted-foreground">{new Date(g.anniversary).toLocaleDateString()}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Top countries" description="Where our guests come from">
          {intel.topCountries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No country data yet.</p>
          ) : (
            <ul className="divide-y">
              {intel.topCountries.map((c: any) => (
                <li key={c.country} className="flex justify-between py-2 text-sm">
                  <span>{c.country}</span>
                  <span className="tabular-nums text-muted-foreground">{c.guest_count}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Top 20 lifetime guests" description="By lifetime spend">
          {intel.topLifetime.length === 0 ? (
            <p className="text-sm text-muted-foreground">No spend data yet.</p>
          ) : (
            <ol className="divide-y">
              {intel.topLifetime.map((g: any, i: number) => (
                <li key={g.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-6 text-xs text-muted-foreground">{i + 1}.</span>
                    <Link to="/admin/guests/crm/$id" params={{ id: g.id }} className="truncate hover:underline">{g.full_name}</Link>
                  </span>
                  <span className="tabular-nums text-muted-foreground">${g.lifetime_spend.toLocaleString()}</span>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Guest acquisition (last 12 months)" description="New guests per month">
        {intel.acquisitionTrend.length === 0 ? (
          <p className="text-sm text-muted-foreground">No acquisition data yet.</p>
        ) : (
          <div className="flex items-end gap-1 overflow-x-auto pt-2">
            {intel.acquisitionTrend.map((p: any) => {
              const max = Math.max(...intel.acquisitionTrend.map((x: any) => x.count), 1);
              const h = Math.max(4, Math.round((p.count / max) * 80));
              return (
                <div key={p.month} className="flex min-w-[36px] flex-col items-center gap-1">
                  <div className="w-6 rounded-t bg-primary/70" style={{ height: h }} title={`${p.count} guests`} />
                  <div className="text-[10px] text-muted-foreground">{p.month.slice(5)}</div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function GuestList({ items }: { items: any[]; icon?: any }) {
  if (!items || items.length === 0) {
    return <p className="text-sm text-muted-foreground">No guests yet.</p>;
  }
  return (
    <ul className="divide-y">
      {items.map((g) => (
        <li key={g.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <Link to="/admin/guests/crm/$id" params={{ id: g.id }} className="font-medium hover:underline">
              {g.full_name}
            </Link>
            <div className="truncate text-xs text-muted-foreground">
              {g.country ?? ""}{g.country && g.email ? " · " : ""}{g.email ?? ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground"><Users className="mr-1 inline size-3" />{g.total_stays}</span>
            <GuestStatusChip status={g.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}