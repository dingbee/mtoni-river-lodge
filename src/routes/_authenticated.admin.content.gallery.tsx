import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/content/gallery")({
  head: () => ({ meta: [{ title: "Gallery — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Gallery" description="Manage the public gallery collections." />,
});
