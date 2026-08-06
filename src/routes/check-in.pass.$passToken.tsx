import { createFileRoute } from "@tanstack/react-router";
import { ArrivalPassPage } from "@/domains/hospitality/online-checkin";

export const Route = createFileRoute("/check-in/pass/$passToken")({
  head: () => ({
    meta: [
      { title: "Your Arrival Pass — Mtoni River Lodge" },
      {
        name: "description",
        content:
          "Your secure digital arrival pass for Mtoni River Lodge. Show the QR code at reception for a fast arrival.",
      },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: "Your Arrival Pass — Mtoni River Lodge" },
      {
        property: "og:description",
        content: "Secure digital arrival pass for your stay at Mtoni River Lodge.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PassRoute,
});

function PassRoute() {
  const { passToken } = Route.useParams();
  return <ArrivalPassPage passToken={passToken} />;
}