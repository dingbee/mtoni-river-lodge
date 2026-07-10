import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/content/homepage")({
  head: () => ({ meta: [{ title: "Homepage — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Homepage" description="Manage the marketing homepage sections." />,
});
