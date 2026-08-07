import { createFileRoute } from "@tanstack/react-router";
import { ProcurementCentre } from "@/modules/restaurant/procurement/ui/ProcurementCentre";

export const Route = createFileRoute("/_authenticated/admin/restaurant/procurement")({
  head: () => ({
    meta: [
      { title: "Procurement Centre — Restaurant & Bar OS" },
      {
        name: "description",
        content:
          "Purchase requests, approvals, supplier confirmation, goods receiving, variances and supplier invoices.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ProcurementCentre,
});
