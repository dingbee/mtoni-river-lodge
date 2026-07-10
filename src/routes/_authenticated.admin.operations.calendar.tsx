import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/operations/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Calendar" description="Reservation calendar and availability grid." />,
});
