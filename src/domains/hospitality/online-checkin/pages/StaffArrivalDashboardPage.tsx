import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Hourglass,
  Star,
  UserCheck,
} from "lucide-react";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { StatCard } from "@/components/os/StatCard";
import { ErrorState } from "@/components/os/ErrorState";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrivalFilters } from "../components/ArrivalFilters";
import { ArrivalTable } from "../components/ArrivalTable";
import { useStaffArrivals } from "../hooks/useArrivals";
import {
  ARRIVAL_ALERT_LABEL,
  type ArrivalListItem,
  type ArrivalsFilter,
  type ArrivalsSummary,
} from "../services/arrivals-shared";

export function StaffArrivalDashboardPage() {
  const [filters, setFilters] = useState<ArrivalsFilter>({ scope: "week" });
  const query = useStaffArrivals(filters);

  const data = query.data as
    | {
        arrivals: ArrivalListItem[];
        summary: ArrivalsSummary;
        rooms: { id: string; name: string }[];
      }
    | undefined;
  const summary = data?.summary;

  const arrivals = useMemo(() => data?.arrivals ?? [], [data]);
  const flagged = useMemo(() => arrivals.filter((a) => a.alerts.length > 0), [arrivals]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Arrivals"
        description="Live online check-in progress, document status and arrival readiness across the reservation book."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Arrivals today"
          value={summary?.todayArrivals ?? 0}
          icon={UserCheck}
          tone="green"
        />
        <StatCard
          label="Upcoming"
          value={summary?.upcoming ?? 0}
          icon={CalendarClock}
          tone="info"
        />
        <StatCard
          label="Completed check-ins"
          value={summary?.completedCheckIns ?? 0}
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard
          label="Pending check-ins"
          value={summary?.pendingCheckIns ?? 0}
          icon={Hourglass}
          tone="gold"
        />
        <StatCard
          label="Missing documents"
          value={summary?.missingDocuments ?? 0}
          icon={FileWarning}
          tone="warn"
        />
        <StatCard
          label="Awaiting review"
          value={summary?.needsReview ?? 0}
          icon={ClipboardList}
          tone="info"
        />
        <StatCard
          label="Conflicts"
          value={summary?.conflicts ?? 0}
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="VIP / special requests"
          value={summary?.vip ?? 0}
          icon={Star}
          tone="gold"
        />
      </div>

      <SectionCard
        title="Arrival management"
        description="Filter, search and open any arrival record."
      >
        <div className="space-y-4">
          <ArrivalFilters filters={filters} rooms={data?.rooms ?? []} onChange={setFilters} />
          {query.isError ? (
            <ErrorState
              title="Could not load arrivals"
              description={(query.error as Error)?.message}
              onRetry={() => void query.refetch()}
            />
          ) : query.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <ArrivalTable items={arrivals} />
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Operational alerts"
        description="Derived from reservations, room states and check-in activity."
      >
        {flagged.length === 0 ? (
          <p className="text-sm text-muted-foreground">No operational alerts in this window.</p>
        ) : (
          <ul className="divide-y text-sm">
            {flagged.flatMap((a) =>
              a.alerts.map((al) => (
                <li
                  key={`${a.bookingId}-${al.kind}`}
                  className="flex flex-wrap items-center gap-2 py-2"
                >
                  <AlertTriangle
                    className={
                      al.severity === "danger"
                        ? "h-4 w-4 text-destructive"
                        : al.severity === "warn"
                          ? "h-4 w-4 text-[color:var(--os-warn)]"
                          : "h-4 w-4 text-muted-foreground"
                    }
                  />
                  <span className="font-medium">{ARRIVAL_ALERT_LABEL[al.kind]}</span>
                  <span className="text-muted-foreground">{al.message}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {a.guestName} · {a.reference} · {a.checkIn}
                  </span>
                </li>
              )),
            )}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
