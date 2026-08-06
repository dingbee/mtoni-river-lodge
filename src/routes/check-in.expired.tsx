import { createFileRoute } from "@tanstack/react-router";
import { CheckInExpiredPage } from "@/domains/hospitality/online-checkin";

export const Route = createFileRoute("/check-in/expired")({
  head: () => ({
    meta: [
      { title: "Check-In Link Expired — Mtoni River Lodge" },
      {
        name: "description",
        content: "This online check-in link has expired. Contact reception for a new link.",
      },
      { property: "og:title", content: "Check-In Link Expired — Mtoni River Lodge" },
      {
        property: "og:description",
        content: "This online check-in link has expired. Contact reception for a new link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: CheckInExpiredPage,
});
