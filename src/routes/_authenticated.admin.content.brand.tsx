import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/content/brand")({
  head: () => ({ meta: [{ title: "Brand Centre — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <ComingSoon
      title="Brand Centre"
      description="Logos, palette, fonts, tone of voice, photography and copywriting guidelines. Used as brand context for future AI features."
    />
  ),
});