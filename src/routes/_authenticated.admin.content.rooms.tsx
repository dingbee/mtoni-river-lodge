import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/content/rooms")({
  head: () => ({ meta: [{ title: "Rooms content — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Rooms content" description="Edit room descriptions, imagery and rates copy." />,
});
