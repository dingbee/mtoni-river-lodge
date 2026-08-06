import { createFileRoute } from "@tanstack/react-router";
import { StaffCheckInReviewPage } from "@/domains/hospitality/online-checkin";

export const Route = createFileRoute("/_authenticated/admin/operations/arrivals/$id")({
  head: () => ({
    meta: [
      { title: "Check-in review — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ReviewRoute,
});

function ReviewRoute() {
  const { id } = Route.useParams();
  return <StaffCheckInReviewPage id={id} />;
}
