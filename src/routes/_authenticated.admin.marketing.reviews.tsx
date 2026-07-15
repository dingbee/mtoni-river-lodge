import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/marketing/reviews")({
  head: () => ({ meta: [{ title: "Reputation — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => (
    <ComingSoon
      title="Reputation Centre"
      description="Rating trends, platform comparison, response status, moderation and featured review selection."
    />
  ),
});