import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/marketing/analytics")({
  head: () => ({ meta: [{ title: "Analytics — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Analytics" description="Traffic, conversion and revenue analytics." />,
});
