import { createFileRoute } from "@tanstack/react-router";
import { StaffArrivalScanPage } from "@/domains/hospitality/online-checkin";

export const Route = createFileRoute("/_authenticated/admin/operations/arrivals/scan")({
  head: () => ({
    meta: [
      { title: "Scan arrival pass — Mtoni OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: () => <StaffArrivalScanPage />,
});