import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/guests/messages")({
  head: () => ({ meta: [{ title: "Messages — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Messages" description="Guest conversations across email and WhatsApp." />,
});
