import { createFileRoute } from "@tanstack/react-router";
import { CheckInSuccessPage } from "@/domains/hospitality/online-checkin";

export const Route = createFileRoute("/check-in/success")({
  head: () => ({
    meta: [
      { title: "Check-In Received — StayNas" },
      {
        name: "description",
        content: "Your online check-in details have been received by StayNas.",
      },
      { property: "og:title", content: "Check-In Received — StayNas" },
      {
        property: "og:description",
        content: "Your online check-in details have been received by StayNas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CheckInSuccessPage,
});
