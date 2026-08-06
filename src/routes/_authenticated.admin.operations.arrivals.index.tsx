import { createFileRoute } from "@tanstack/react-router";
import { StaffArrivalDashboardPage } from "@/domains/hospitality/online-checkin";

export const Route = createFileRoute("/_authenticated/admin/operations/arrivals/")({
  head: () => ({
    meta: [{ title: "Arrivals — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }],
  }),
  component: StaffArrivalDashboardPage,
});