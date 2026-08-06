import { createFileRoute } from "@tanstack/react-router";
import { CheckInSuccessPage } from "@/domains/hospitality/online-checkin";

export const Route = createFileRoute("/check-in/success")({
  head: () => ({
    meta: [
      { title: "Check-In Received — Mtoni River Lodge" },
      {
        name: "description",
        content: "Your online check-in details have been received by Mtoni River Lodge.",
      },
      { property: "og:title", content: "Check-In Received — Mtoni River Lodge" },
      {
        property: "og:description",
        content: "Your online check-in details have been received by Mtoni River Lodge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CheckInSuccessPage,
});
