import { createFileRoute } from "@tanstack/react-router";
import { ReconciliationCentre } from "@/modules/restaurant/reconciliation/ui/ReconciliationCentre";

export const Route = createFileRoute("/_authenticated/admin/restaurant/reconciliation")({
  head: () => ({
    meta: [
      { title: "Reconciliation & Daily Close — Mtoni Restaurant OS" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ReconciliationCentre,
});