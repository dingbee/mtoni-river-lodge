import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/marketing/campaigns")({
  head: () => ({ meta: [{ title: "Campaigns — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Campaigns" description="Email, offers and seasonal campaigns." />,
});
