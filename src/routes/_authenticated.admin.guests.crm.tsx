import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/guests/crm")({
  head: () => ({ meta: [{ title: "Guest CRM — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Guest CRM" description="Unified guest profiles and history." />,
});
