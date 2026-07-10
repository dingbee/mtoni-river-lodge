import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/operations/rooms")({
  head: () => ({ meta: [{ title: "Rooms — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Rooms" description="Room-level operations, maintenance and blocks." />,
});
