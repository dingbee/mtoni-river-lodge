import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/content/calendar")({
  head: () => ({ meta: [{ title: "Content Calendar — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <ComingSoon
      title="Content Calendar"
      description="Unified drag-and-drop calendar across journal, homepage, campaigns, promotions and social content."
    />
  ),
});