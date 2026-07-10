import { createFileRoute } from "@tanstack/react-router";
import {
  BedDouble,
  CalendarCheck,
  CalendarX,
  Clock,
  DollarSign,
  Star,
  LineChart,
  Bell,
} from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { StatCard } from "@/components/os/StatCard";
import { SectionCard } from "@/components/os/SectionCard";
import { EmptyState } from "@/components/os/EmptyState";

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
          <EmptyState
            title="No arrivals loaded"
            description="Connect this widget to reservations in Sprint 2."
          />
        </SectionCard>
        <SectionCard title="Recent activity" description="Latest admin actions">
          <EmptyState
            title="No recent activity"
            description="Actions from all admins will surface here."
          />
        </SectionCard>
      </div>
    </div>
  );
}