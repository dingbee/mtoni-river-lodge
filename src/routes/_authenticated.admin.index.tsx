import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCrmDashboard } from "@/lib/guests.functions";
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
  const crm = (crmQ.data as any) ?? { recent: [], returning: [], vip: [], arrivals: [] };
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