import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, CreditCard, FileText } from "lucide-react";
import {
  getFounderCommercialWorkspace,
  getFounderSubscriptionSetup,
  createFounderCommercialSubscription,
} from "@/domains/commercial/founder-control-centre.functions";

export const Route = createFileRoute("/_authenticated/founder/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscription Administration â€” StayNas Founder" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const { getCommercialFounderStatus } =
      await import("@/domains/_platform/founder-admin.functions");
    const access = await getCommercialFounderStatus();
    if (!access.isFounderAdmin) throw redirect({ to: "/settings" });
  },
  loader: async () => {
    const workspace = await getFounderCommercialWorkspace();
    try {
      return { workspace, setup: await getFounderSubscriptionSetup(), setupError: null };
    } catch (error) {
      return {
        workspace,
        setup: null,
        setupError:
          error instanceof Error
            ? error.message
            : "Published plan and pricing policies are unavailable.",
      };
    }
  },
  component: FounderSubscriptions,
});
type Currency = "TZS" | "USD";
type Setup = {
  plans: Array<{ code: string; name: string; status: string }>;
  planVersions: Array<{
    planCode: strin¶»§q«^