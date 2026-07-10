import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/staff/activity")({
  head: () => ({ meta: [{ title: "Activity Log — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Activity Log" description="Immutable log of all admin actions." />,
});
