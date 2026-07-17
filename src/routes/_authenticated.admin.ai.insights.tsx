import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/ai/insights")({
  head: () => ({ meta: [{ title: "AI Insights — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <ComingSoon
      title="AI Insights"
      description="Proactive, scheduled insights across reservations, revenue and operations. Arriving in Sprint 8B."
    />
  ),
});