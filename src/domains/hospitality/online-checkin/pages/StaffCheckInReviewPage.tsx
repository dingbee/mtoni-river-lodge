import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/os/PageHeader";
import { SectionCard } from "@/components/os/SectionCard";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/os/EmptyState";
import { StaffDocumentPanel } from "../components/StaffDocumentPanel";
import { checkInStatusLabel } from "../utils";
import type { CheckInStatus } from "../types";

export function StaffCheckInReviewPage({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ["staff-checkin-review", id],
    queryFn: async () => {
      const { data: booking, error } = await supabase
        .from("bookings")
        .select("id, reference, guest_name, guest_email, check_in, check_out, nights")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const { data: checkin } = await supabase
        .from("guest_checkins")
        .select("id, status, submitted_at, signature_name")
        .eq("booking_id", id)
        .maybeSingle();
      const { data: arrival } = await supabase
        .from("arrival_information")
        .select(
          "estimated_arrival_time, arrival_date, arrival_mode, flight_number, transfer_required, dietary_requirements, special_requests",
        )
        .eq("booking_id", id)
        .maybeSingle();
      return { booking, checkin, arrival };
    },
  });

  if (query.isLoading) return <Skeleton className="h-64 w-full" />;
  if (!query.data?.booking) {
    return <EmptyState title="Reservation not found" description="This arrival no longer exists." />;
  }

  const { booking, checkin, arrival } = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Check-in review — ${booking.reference}`}
        description={`${booking.guest_name} · ${booking.check_in} → ${booking.check_out} · ${
          checkin ? checkInStatusLabel(checkin.status as CheckInStatus) : "No check-in link"
        }`}
      />

      <SectionCard title="Submitted details">
        <dl className="divide-y divide-border text-sm">
          {[
            ["Email", booking.guest_email],
            ["Arrival date", arrival?.arrival_date ?? "—"],
            ["Arrival time", arrival?.estimated_arrival_time ?? "—"],
            ["Arriving by", arrival?.arrival_mode ?? "—"],
            ["Flight", arrival?.flight_number ?? "—"],
            ["Airport transfer", arrival?.transfer_required ? "Requested" : "Not required"],
            ["Dietary", arrival?.dietary_requirements ?? "—"],
            ["Notes", arrival?.special_requests ?? "—"],
            ["Signed by", checkin?.signature_name ?? "—"],
            [
              "Submitted",
              checkin?.submitted_at ? new Date(checkin.submitted_at).toLocaleString() : "—",
            ],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex gap-4 py-2">
              <dt className="w-44 shrink-0 text-muted-foreground">{label}</dt>
              <dd className="text-foreground">{String(value ?? "—")}</dd>
            </div>
          ))}
        </dl>
      </SectionCard>

      <SectionCard
        title="Identity documents"
        description="Verify or reject each document before arrival."
      >
        <StaffDocumentPanel bookingId={booking.id} />
      </SectionCard>
    </div>
  );
}
