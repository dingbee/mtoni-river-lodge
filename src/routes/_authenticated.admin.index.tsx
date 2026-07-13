import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCrmDashboard } from "@/lib/guests.functions";
import { getDashboardIntelligence } from "@/lib/guest-intelligence.functions";
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
} from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";
import { GuestStatusChip } from "@/components/os/crm/GuestStatusChip";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [{ title: "Dashboard — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: DashboardPage,
});

// TODO(sprint-2): replace with real Supabase-backed metrics.
function useDashboardMetrics() {
  return {
    occupancy: "—",
    arrivals: 0,
    departures: 0,
    pending: 0,
    revenue: "$—",
    reviewRating: "—",
    reviewCount: 0,
    traffic: "—",
    notifications: 0,
  };
}

function DashboardPage() {
  const m = useDashboardMetrics();
  const fn = useServerFn(getCrmDashboard);
  const crmQ = useQuery({ queryKey: ["crm-dashboard"], queryFn: () => fn(), staleTime: 60_000 });
  const intelFn = useServerFn(getDashboardIntelligence);
  const intelQ = useQuery({ queryKey: ["crm-intelligence"], queryFn: () => intelFn(), staleTime: 60_000 });
  const crm = (crmQ.data as any) ?? { recent: [], returning: [], vip: [], arrivals: [] };
  const intel = (intelQ.data as any) ?? {
    vipArrivals: [], birthdays: [], anniversaries: [], topCountries: [], topLifetime: [], acquisitionTrend: [],
  };
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Welcome to Mtoni OS"
        description={`Operational snapshot for ${today}. Live data lands in Sprint 2.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Occupancy" value={m.occupancy} hint="Tonight" icon={BedDouble} />
        <StatCard label="Arrivals" value={m.arrivals} hint="Today" icon={CalendarCheck} />
        <StatCard label="Departures" value={m.departures} hint="Today" icon={CalendarX} />
        <StatCard label="Pending bookings" value={m.pending} hint="Awaiting confirmation" icon={Clock} />
        <StatCard label="Revenue" value={m.revenue} hint="Month to date" icon={DollarSign} />
        <StatCard
          label="Reviews"
          value={m.reviewRating}
          hint={`${m.reviewCount} total`}
          icon={Star}
        />
        <StatCard label="Website traffic" value={m.traffic} hint="Last 7 days" icon={LineChart} />
        <StatCard label="Notifications" value={m.notifications} hint="Unread" icon={Bell} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <SectionCard title="Upcoming arrivals" description="Next 7 days" className="lg:col-span-2">
          {crm.arrivals.length === 0 ? (
            <EmptyState title="No upcoming arrivals" description="Confirmed and pending bookings will appear here." />
          ) : (
            <ul className="divide-y">
              {crm.arrivals.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{a.guest_name}</div>
                    <div className="text-xs text-muted-foreground">{a.reference} · {new Date(a.check_in).toLocaleDateString()} → {new Date(a.check_out).toLocaleDateString()}</div>
                  </div>
                  {a.guest_id && (
                    <Link to="/admin/guests/crm/$id" params={{ id: a.guest_id }} className="text-xs text-primary hover:underline">
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