import { createFileRoute } from "@tanstack/react-router";
import { GuestPortalPage } from "@/domains/hospitality/guest-portal";

export const Route = createFileRoute("/guest/$token")({
  head: () => ({
    meta: [
      { title: "StayNas Guest Portal" },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: GuestPortalRoute,
});

function GuestPortalRoute() {
  const { token } = Route.useParams();
  return <GuestPortalPage token={token} />;
}
