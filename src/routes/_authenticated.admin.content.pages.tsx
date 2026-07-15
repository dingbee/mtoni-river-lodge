import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/content/pages")({
  head: () => ({ meta: [{ title: "Pages — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <ComingSoon
      title="Pages"
      description="Draft, review, publish, schedule and archive website pages. Block-based editor and version history arrive in Sprint 5 Phase 2."
    />
  ),
});