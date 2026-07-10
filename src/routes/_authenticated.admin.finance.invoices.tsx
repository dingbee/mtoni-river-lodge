import { createFileRoute } from "@tanstack/react-router";
import { ComingSoon } from "@/components/os/ComingSoon";

export const Route = createFileRoute("/_authenticated/admin/finance/invoices")({
  head: () => ({ meta: [{ title: "Invoices — Mtoni OS" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: () => <ComingSoon title="Invoices" description="Generate and manage guest invoices." />,
});
