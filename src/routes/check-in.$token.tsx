import { createFileRoute } from "@tanstack/react-router";
import { GuestCheckInPage } from "@/domains/hospitality/online-checkin";

export const Route = createFileRoute("/check-in/$token")({
  head: () => ({
    meta: [
      { title: "Online Check-In — Mtoni River Lodge" },
      { name: "description", content: "Complete your details before arrival at Mtoni River Lodge." },
      { property: "og:title", content: "Online Check-In — Mtoni River Lodge" },
      { property: "og:description", content: "Complete your details before arrival at Mtoni River Lodge." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: GuestCheckInRoute,
});

function GuestCheckInRoute() {
  const { token } = Route.useParams();
  return <GuestCheckInPage token={token} />;
}