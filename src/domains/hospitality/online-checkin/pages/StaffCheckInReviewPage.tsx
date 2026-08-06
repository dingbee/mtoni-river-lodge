import { ComingSoon } from "@/components/os/ComingSoon";

export function StaffCheckInReviewPage({ id }: { id: string }) {
  return (
    <ComingSoon
      title="Check-in review"
      description={`Review submitted guest details for reservation ${id} before approving arrival.`}
      moduleName="Online Check-In"
    />
  );
}