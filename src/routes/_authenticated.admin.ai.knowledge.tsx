import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/ai/knowledge")({
  head: () => ({ meta: [{ title: "AI Knowledge Base — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <ComingSoon
      title="Knowledge Base"
      description="Curate brand voice, policies and reference documents Mtoni AI can draw from. Arriving in Sprint 8B."
    />
  ),
});