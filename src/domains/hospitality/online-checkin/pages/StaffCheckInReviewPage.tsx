/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped at this boundary, matching existing ops services. */
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/os/StatusChip";
import { ErrorState } from "@/components/os/ErrorState";
import { EmptyState } from "@/components/os/EmptyState";
import { StaffDocumentPanel } from "../components/StaffDocumentPanel";
import { StaffReviewActions } from "../components/StaffReviewActions";
import { ArrivalBriefingCard } from "../components/ArrivalBriefingCard";
import { ArrivalTimelinePanel } from "../components/ArrivalTimelinePanel";
import { useStaffArrivalDetail } from "../hooks/useArrivals";
import {
  CHECKIN_STATUS_FILTER_LABEL,
  checkinStatusTone,
  roomReadinessLabel,
  roomReadinessTone,
  type CheckInStatusFilter,
} from "../services/arrivals-shared";

function Rows({ rows }: { rows: [string, unknown][] }) {
  return (
    <dl className="divide-y divide-border text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="flex gap-4 py-2">
          <dt className="w-44 shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-foreground">
            {value === null || value === undefined || value === "" ? "—" : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StaffCheckInReviewPage({ id }: { id: string }) {
  const query = useStaffArrivalDetail(id);

  if (query.isError) {
    return (
      <ErrorState
        title="Could not load this arrival"
        description={(query.error as Error)?.message}
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (query.isLoading) return <Skeleton className="h-64 w-full" />;

  const detail = query.data as any;
  if (!detail?.booking) {
    return (
      <EmptyState title="Reservation not found" description="This arrival no longer exists." />
    );
  }

  const {
    booking,
    checkin,
    arrival,
    room,
    assignedUnit,
    roomStates,
    eligibility,
    preferences,
    notes,
    canOverride,
  } = detail;
  const status = (checkin?.status ?? "no_link") as CheckInStatusFilter;
  const readiness =
    assignedUnit?.state ??
    (roomStates?.some((r: any) => r.state === "vacant_clean") ? "vacant_clean" : "not_ready");

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Check-in review — ${booking.reference}`}
        description={`${booking.guest_name} · ${booking.check_in} → ${booking.check_out} · ${booking.nights} nights`}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip tone={checkinStatusTone(status)}>
              {CHECKIN_STATUS_FILTER_LABEL[status]}
            </StatusChip>
            <Button asChild size="sm" variant="outline">
              <Link to="/admin/operations/reservations/$id" params={{ id: booking.id }}>
                Reservation
              </Link>
            </Button>
          </div>
        }
      />

      <ArrivalBriefingCard bookingId={booking.id} />

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Guest information">
          <Rows
            rows={[
              ["Name", booking.guest_name],
              ["Email", booking.guest_email],
              ["Phone", booking.guest_phone],
              ["Country", booking.country],
              ["Guests", `${booking.adults} adults · ${booking.children} children`],
              ["Guest type", booking.guest_type],
              ["Emergency contact", arrival?.emergency_contact_name],
              ["Emergency phone", arrival?.emergency_contact_phone],
              ["Relationship", arrival?.emergency_contact_relation],
              [
                "Preferences",
                preferences ? JSON.stringify(preferences.preferences ?? preferences) : null,
              ],
            ]}
          />
        </SectionCard>

        <SectionCard title="Arrival details">
          <Rows
            rows={[
              ["Arrival date", arrival?.arrival_date],
              ["Arrival time", arrival?.estimated_arrival_time],
              ["Arriving by", arrival?.arrival_mode],
              ["Flight", arrival?.flight_number],
              ["Flight arrival", arrival?.flight_arrival_time],
              ["Airport", arrival?.airport],
              ["Airport transfer", arrival?.transfer_required ? "Requested" : "Not required"],
              ["Transfer notes", arrival?.transfer_notes],
              ["Dietary", arrival?.dietary_requirements],
              ["Accessibility", arrival?.accessibility_needs],
              ["Purpose", arrival?.visit_purpose],
              ["Special requests", arrival?.special_requests ?? booking.special_requests],
              ["Signed by", checkin?.signature_name],
              [
                "Submitted",
                checkin?.submitted_at ? new Date(checkin.submitted_at).toLocaleString() : null,
              ],
            ]}
          />
        </SectionCard>

        <SectionCard title="Reservation & room">
          <Rows
            rows={[
              ["Reference", booking.reference],
              ["Reservation status", String(booking.status).replace("_", " ")],
              ["Payment status", String(booking.payment_status).replace("_", " ")],
              ["Balance", `${booking.currency} ${Number(booking.balance_amount ?? 0).toFixed(2)}`],
              ["Room", room?.name],
              ["Allocated unit", assignedUnit?.unit_label ?? "Not yet assigned"],
              [
                "Checked in at",
                booking.checked_in_at ? new Date(booking.checked_in_at).toLocaleString() : null,
              ],
              [
                "Check-in eligibility",
                eligibility?.eligible
                  ? "Eligible"
                  : (eligibility?.message ?? eligibility?.code ?? "—"),
              ],
            ]}
          />
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Room readiness</span>
            <StatusChip tone={roomReadinessTone(readiness)}>
              {roomReadinessLabel(readiness)}
            </StatusChip>
          </div>
        </SectionCard>

        <SectionCard
          title="Review actions"
          description="All actions are permission-checked and audit logged."
        >
          <StaffReviewActions
            bookingId={booking.id}
            hasCheckIn={Boolean(checkin)}
            canOverride={Boolean(canOverride)}
          />
          {checkin?.rejection_reason && (
            <p className="mt-3 text-xs text-destructive">Last reason: {checkin.rejection_reason}</p>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Identity documents"
        description="Verify or reject each document before arrival."
      >
        <StaffDocumentPanel bookingId={booking.id} />
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ArrivalTimelinePanel bookingId={booking.id} />

        <SectionCard
          title="Staff notes"
          description="Shared with the guest profile in Guest Intelligence."
        >
          {!notes?.length ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {notes.map((n: any) => (
                <li key={n.id} className="py-2">
                  <p className="text-foreground">{n.body}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
